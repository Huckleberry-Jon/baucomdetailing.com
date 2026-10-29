import Flutter
import UIKit
import Security
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var sessionChannel: FlutterMethodChannel?
  private let notifications = NativePushCoordinator()

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    UNUserNotificationCenter.current().delegate = notifications
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    notifications.registered(deviceToken)
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }
  override func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    notifications.failed()
    super.application(application, didFailToRegisterForRemoteNotificationsWithError: error)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "DocDetailingNotifications") {
      notifications.attach(FlutterMethodChannel(name: "com.docincorporated.docdetailing/notifications", binaryMessenger: registrar.messenger()))
    }
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "DocDetailingSession") {
      let channel = FlutterMethodChannel(name: "com.docincorporated.docdetailing/session", binaryMessenger: registrar.messenger())
      channel.setMethodCallHandler { call, result in
        SessionKeychain.handle(call, result: result)
      }
      sessionChannel = channel
    }
  }
}


private enum SessionKeychain {
  static let service = "com.docincorporated.docdetailing.owner-sessions"
  static func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    guard let args = call.arguments as? [String: Any],
          let account = args["account"] as? String,
          account.count <= 2048, account.hasPrefix("https://") else {
      result(FlutterError(code: "invalid_account", message: "Invalid session origin", details: nil)); return
    }
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service, kSecAttrAccount as String: account,
      kSecAttrSynchronizable as String: false]
    var status: OSStatus
    switch call.method {
    case "read":
      var read = query
      read[kSecReturnData as String] = true
      read[kSecMatchLimit as String] = kSecMatchLimitOne
      var data: CFTypeRef?
      status = SecItemCopyMatching(read as CFDictionary, &data)
      if status == errSecItemNotFound { result(nil); return }
      if status == errSecSuccess, let bytes = data as? Data {
        result(String(data: bytes, encoding: .utf8)); return
      }
    case "write":
      guard let value = args["value"] as? String, value.utf8.count <= 16384 else {
        result(FlutterError(code: "invalid_value", message: "Invalid session data", details: nil)); return
      }
      let attributes: [String: Any] = [kSecValueData as String: Data(value.utf8),
        kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
      status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
      if status == errSecItemNotFound {
        status = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil)
      }
    case "delete":
      status = SecItemDelete(query as CFDictionary)
      if status == errSecItemNotFound { status = errSecSuccess }
    default:
      result(FlutterMethodNotImplemented); return
    }
    if status == errSecSuccess { result(nil) }
    else { result(FlutterError(code: "keychain_unavailable", message: "Secure session storage is unavailable", details: nil)) }
  }
}

private final class NativePushCoordinator: NSObject, UNUserNotificationCenterDelegate {
  var channel: FlutterMethodChannel?
  private var token: String?
  private var pendingTap: [String: Any]?
  func attach(_ channel: FlutterMethodChannel) {
    self.channel = channel
    channel.setMethodCallHandler { [weak self] call, result in
      guard let self = self else { result(nil); return }
      switch call.method {
      case "status": self.status(result)
      case "request":
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in
          self.status(result)
        }
      case "settings":
        DispatchQueue.main.async {
          if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
          }
          result(nil)
        }
      default: result(FlutterMethodNotImplemented)
      }
    }
  }
  func status(_ result: @escaping FlutterResult) {
    UNUserNotificationCenter.current().getNotificationSettings { settings in
      DispatchQueue.main.async {
        let permission: String
        switch settings.authorizationStatus {
        case .authorized: permission = "authorized"
        case .provisional, .ephemeral: permission = "provisional"
        case .denied: permission = "denied"
        case .notDetermined: permission = "notDetermined"
        @unknown default: permission = "unknown"
        }
        var state: [String: Any] = ["permission": permission]
        if let token = self.token { state["token"] = token }
        result(state)
        if let tap = self.pendingTap {
          self.pendingTap = nil
          self.emit(tap)
        }
        if permission == "authorized" || permission == "provisional" {
          UIApplication.shared.registerForRemoteNotifications()
        }
      }
    }
  }
  func registered(_ data: Data) {
    let next = data.map { String(format: "%02x", $0) }.joined()
    guard next != token else { return }
    token = next
    emit(["type": "token", "token": next])
  }
  func failed() { emit(["type": "failure"]) }
  private func payload(_ content: UNNotificationContent, type: String) -> [String: Any]? {
    let data = content.userInfo
    guard let event = data["eventId"] as? String,
          let booking = data["bookingId"] as? String,
          let business = data["businessId"] as? String,
          event.count <= 100, booking.count <= 100, business.count <= 100 else { return nil }
    return ["type": type, "eventId": event, "bookingId": booking, "businessId": business]
  }
  private func emit(_ value: [String: Any]) {
    DispatchQueue.main.async {
      if self.channel != nil { self.channel?.invokeMethod("event", arguments: value) }
      else if value["type"] as? String == "tap" { self.pendingTap = value }
    }
  }
  func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    if let value = payload(notification.request.content, type: "foreground") { emit(value) }
    if #available(iOS 14.0, *) {
      completionHandler([.banner, .list, .sound, .badge])
    } else {
      completionHandler([.alert, .sound, .badge])
    }
  }
  func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void) {
    if let value = payload(response.notification.request.content, type: "tap") {
      // Keep the cold-start tap until Dart explicitly asks for status after authentication.
      pendingTap = value
      emit(value)
    }
    completionHandler()
  }
}

