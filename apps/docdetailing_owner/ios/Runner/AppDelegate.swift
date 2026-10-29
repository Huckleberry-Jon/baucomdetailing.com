import Flutter
import UIKit
import Security

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var sessionChannel: FlutterMethodChannel?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
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
