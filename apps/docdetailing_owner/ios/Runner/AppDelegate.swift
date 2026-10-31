import Flutter
import UIKit
import Security
import UserNotifications
import MessageUI
import Vision

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var sessionChannel: FlutterMethodChannel?
  private let notifications = NativePushCoordinator()
  private let documentComposer = DocumentComposer()
  private let receiptScanner = ReceiptScanner()

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
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "DocDetailingReceipts") {
      receiptScanner.attach(FlutterMethodChannel(name: "com.docincorporated.docdetailing/receipts", binaryMessenger: registrar.messenger()))
    }
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "DocDetailingDocuments") {
      documentComposer.attach(FlutterMethodChannel(name: "com.docincorporated.docdetailing/documents", binaryMessenger: registrar.messenger()))
    }
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



private final class DocumentComposer: NSObject, MFMailComposeViewControllerDelegate, MFMessageComposeViewControllerDelegate {
  private var channel: FlutterMethodChannel?
  private var pending: FlutterResult?
  func attach(_ channel: FlutterMethodChannel) {
    self.channel = channel
    channel.setMethodCallHandler { [weak self] call, result in
      guard let self = self else { result(FlutterError(code: "unavailable", message: "Message composer unavailable", details: nil)); return }
      self.handle(call, result: result)
    }
  }
  private func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    guard ["composeEmail", "composeText"].contains(call.method) else { result(FlutterMethodNotImplemented); return }
    guard pending == nil else { result(FlutterError(code: "busy", message: "Close the current message draft first", details: nil)); return }
    guard let args = call.arguments as? [String: Any], let pdf = args["pdf"] as? FlutterStandardTypedData,
          pdf.data.count > 0, pdf.data.count <= 20 * 1024 * 1024,
          let recipient = args["recipient"] as? String, !recipient.isEmpty, recipient.count <= 254,
          let body = args["body"] as? String, body.count <= 4000,
          let filename = args["filename"] as? String, filename.hasSuffix(".pdf"), filename.count <= 150,
          !filename.contains("/"), !filename.contains("\\") else {
      result(FlutterError(code: "invalid_document", message: "Check the recipient and PDF attachment", details: nil)); return
    }
    guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(where: { $0.activationState == .foregroundActive }),
          var presenter = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else {
      result(FlutterError(code: "unavailable", message: "Message composer unavailable", details: nil)); return
    }
    while let next = presenter.presentedViewController { presenter = next }
    if call.method == "composeEmail" {
      guard MFMailComposeViewController.canSendMail() else { result("unavailable"); return }
      let composer = MFMailComposeViewController()
      composer.mailComposeDelegate = self
      composer.setToRecipients([recipient])
      composer.setSubject(String((args["subject"] as? String ?? "Invoice").prefix(250)))
      composer.setMessageBody(body, isHTML: false)
      composer.addAttachmentData(pdf.data, mimeType: "application/pdf", fileName: filename)
      pending = result
      presenter.present(composer, animated: true)
    } else {
      guard MFMessageComposeViewController.canSendText(), MFMessageComposeViewController.canSendAttachments() else { result("unavailable"); return }
      let composer = MFMessageComposeViewController()
      composer.messageComposeDelegate = self
      composer.recipients = [recipient]
      composer.body = body
      guard composer.addAttachmentData(pdf.data, typeIdentifier: "com.adobe.pdf", filename: filename) else { result("unavailable"); return }
      pending = result
      presenter.present(composer, animated: true)
    }
  }
  private func finish(_ controller: UIViewController, status: String) {
    let callback = pending
    pending = nil
    controller.dismiss(animated: true) { callback?(status) }
  }
  func mailComposeController(_ controller: MFMailComposeViewController, didFinishWith result: MFMailComposeResult, error: Error?) {
    let status = error != nil || result == .failed ? "failed" : result == .sent ? "sent" : "cancelled"
    finish(controller, status: status)
  }
  func messageComposeViewController(_ controller: MFMessageComposeViewController, didFinishWith result: MessageComposeResult) {
    finish(controller, status: result == .sent ? "sent" : result == .failed ? "failed" : "cancelled")
  }
}

private final class ReceiptScanner {
  private var channel: FlutterMethodChannel?
  func attach(_ channel: FlutterMethodChannel) {
    self.channel = channel
    channel.setMethodCallHandler { call, result in
      guard call.method == "recognize" else { result(FlutterMethodNotImplemented); return }
      guard let args = call.arguments as? [String: Any], let bytes = args["bytes"] as? FlutterStandardTypedData,
        bytes.data.count > 0, bytes.data.count <= 4 * 1024 * 1024 else {
        result(FlutterError(code: "invalid_image", message: "Use a receipt photo under 4 MB.", details: nil)); return
      }
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let request = VNRecognizeTextRequest()
          request.recognitionLevel = .accurate
          request.recognitionLanguages = ["en-US"]
          request.usesLanguageCorrection = true
          let handler = VNImageRequestHandler(data: bytes.data, options: [:])
          try handler.perform([request])
          let observations = request.results ?? []
          // Preserve receipt reading order; columns on one row are merged for line-item parsing.
          let ordered = observations.sorted { a, b in
            if a.boundingBox.midY == b.boundingBox.midY { return a.boundingBox.minX < b.boundingBox.minX }
            return a.boundingBox.midY > b.boundingBox.midY
          }
          var rows: [(Double, String)] = []
          for item in ordered {
            guard let text = item.topCandidates(1).first?.string else { continue }
            let y = Double(item.boundingBox.midY)
            if let last = rows.last, abs(last.0-y) < 0.012 { rows[rows.count-1].1 += "  " + text }
            else { rows.append((y,text)) }
          }
          let text = rows.map { $0.1 }.joined(separator: "\n")
          DispatchQueue.main.async { result(String(text.prefix(30000))) }
        } catch {
          DispatchQueue.main.async { result(FlutterError(code: "recognition_failed", message: "Receipt text could not be read. Retake the photo or enter items manually.", details: nil)) }
        }
      }
    }
  }
}
