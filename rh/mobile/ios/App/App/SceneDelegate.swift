import UIKit
import Capacitor
import LocalAuthentication
import Security

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = AppViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// Tela principal do app: registra o plugin próprio da chave do ponto.
class AppViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(ChaveSeguraPlugin())
    }
}

/// Chave do ponto presa ao Secure Enclave do iPhone. A chave privada nunca sai do chip e
/// só assina depois do Face ID ou Touch ID do dono (.biometryCurrentSet: se alguém cadastrar
/// outra digital ou rosto, a chave deixa de funcionar).
@objc(ChaveSeguraPlugin)
public class ChaveSeguraPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ChaveSeguraPlugin"
    public let jsName = "ChaveSegura"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "disponivel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "criar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "assinar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "apagar", returnType: CAPPluginReturnPromise),
    ]
    private let tag = "br.com.nexorconsultingit.ponto.chave".data(using: .utf8)!

    private func b64url(_ d: Data) -> String {
        d.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    private func em32(_ v: Data) -> Data {
        var b = [UInt8](v)
        while b.count > 32 && b.first == 0 { b.removeFirst() }
        return Data(repeating: 0, count: max(0, 32 - b.count)) + Data(b)
    }

    /// Assinatura DER (SEQUENCE{r,s}) para r||s de 64 bytes, o formato que o servidor confere
    private func derParaP1363(_ der: Data) -> Data? {
        let b = [UInt8](der)
        guard b.count > 8, b[0] == 0x30 else { return nil }
        var i = (b[1] & 0x80) != 0 ? 2 + Int(b[1] & 0x7f) : 2
        guard b[i] == 0x02 else { return nil }
        let lr = Int(b[i + 1]); let r = Data(b[(i + 2)..<(i + 2 + lr)]); i += 2 + lr
        guard b[i] == 0x02 else { return nil }
        let ls = Int(b[i + 1]); let s = Data(b[(i + 2)..<(i + 2 + ls)])
        return em32(r) + em32(s)
    }

    private func apagarChave() {
        let q: [String: Any] = [kSecClass as String: kSecClassKey, kSecAttrApplicationTag as String: tag]
        SecItemDelete(q as CFDictionary)
    }

    @objc func disponivel(_ call: CAPPluginCall) {
        var erro: NSError?
        let ok = LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &erro)
        call.resolve(["disponivel": ok])
    }

    @objc func criar(_ call: CAPPluginCall) {
        #if targetEnvironment(simulator)
        call.reject("O simulador não tem Secure Enclave.", "sem_hardware")
        #else
        apagarChave()
        var erro: Unmanaged<CFError>?
        guard let acesso = SecAccessControlCreateWithFlags(kCFAllocatorDefault, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, [.privateKeyUsage, .biometryCurrentSet], &erro) else {
            call.reject("Ative o código e o Face ID ou Touch ID do iPhone para usar a biometria do ponto.", "sem_hardware")
            return
        }
        let atributos: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: tag,
                kSecAttrAccessControl as String: acesso,
            ],
        ]
        guard let privada = SecKeyCreateRandomKey(atributos as CFDictionary, &erro),
              let publica = SecKeyCopyPublicKey(privada),
              let bruta = SecKeyCopyExternalRepresentation(publica, &erro) as Data?,
              bruta.count == 65 else {
            call.reject("Não foi possível criar a chave do ponto no Secure Enclave.", "erro")
            return
        }
        call.resolve([
            "x": b64url(bruta.subdata(in: 1..<33)),
            "y": b64url(bruta.subdata(in: 33..<65)),
            "hardware": true,
            "strongbox": true,
        ])
        #endif
    }

    @objc func assinar(_ call: CAPPluginCall) {
        guard let desafio = call.getString("desafio")?.data(using: .utf8) else {
            call.reject("Desafio ausente.", "erro")
            return
        }
        let contexto = LAContext()
        contexto.localizedReason = call.getString("motivo") ?? "Confirme para registrar o ponto"
        contexto.localizedCancelTitle = "Cancelar"
        let q: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: tag,
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnRef as String: true,
            kSecUseAuthenticationContext as String: contexto,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess, let achado = item else {
            call.reject("Chave do ponto não encontrada. Ative a biometria do ponto de novo.", "sem_chave")
            return
        }
        let chave = achado as! SecKey
        DispatchQueue.global(qos: .userInitiated).async {
            var erro: Unmanaged<CFError>?
            guard let der = SecKeyCreateSignature(chave, .ecdsaSignatureMessageX962SHA256, desafio as CFData, &erro) as Data? else {
                let codigo = erro.map { CFErrorGetCode($0.takeRetainedValue()) } ?? 0
                let cancelado = codigo == Int(errSecUserCanceled) || codigo == LAError.userCancel.rawValue || codigo == LAError.appCancel.rawValue || codigo == LAError.systemCancel.rawValue
                call.reject(cancelado ? "Biometria cancelada." : "A digital ou o rosto não foram confirmados.", cancelado ? "cancelado" : "erro")
                return
            }
            guard let assinatura = self.derParaP1363(der) else {
                call.reject("Assinatura inválida.", "erro")
                return
            }
            call.resolve(["assinatura": self.b64url(assinatura)])
        }
    }

    @objc func apagar(_ call: CAPPluginCall) {
        apagarChave()
        call.resolve()
    }
}
