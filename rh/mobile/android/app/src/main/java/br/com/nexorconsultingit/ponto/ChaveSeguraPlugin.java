package br.com.nexorconsultingit.ponto;

import android.content.pm.PackageManager;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.security.keystore.StrongBoxUnavailableException;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;

/**
 * Chave do ponto presa ao chip de segurança do celular (Android Keystore, TEE ou StrongBox).
 * A chave privada nunca sai do chip e só assina depois da digital ou do rosto (BiometricPrompt
 * com CryptoObject): nem um app com root consegue usá-la sem a biometria do dono.
 */
@CapacitorPlugin(name = "ChaveSegura")
public class ChaveSeguraPlugin extends Plugin {
    private static final String ALIAS = "nexor_ponto_chave_hw";

    private static String b64url(byte[] b) {
        return Base64.encodeToString(b, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    /** Inteiro positivo em exatamente 32 bytes (coordenada ou parte da assinatura P-256) */
    private static byte[] em32(byte[] v) {
        byte[] out = new byte[32];
        int ini = 0;
        while (ini < v.length - 1 && v[ini] == 0) ini++;
        int n = v.length - ini;
        if (n > 32) throw new IllegalArgumentException("valor grande demais");
        System.arraycopy(v, ini, out, 32 - n, n);
        return out;
    }

    /** Assinatura DER (SEQUENCE{r,s}) para o formato r||s de 64 bytes que o servidor confere */
    static byte[] derParaP1363(byte[] der) {
        int i = 2;
        if ((der[1] & 0x80) != 0) i = 2 + (der[1] & 0x7f);
        int lr = der[i + 1];
        byte[] r = new byte[lr];
        System.arraycopy(der, i + 2, r, 0, lr);
        i = i + 2 + lr;
        int ls = der[i + 1];
        byte[] s = new byte[ls];
        System.arraycopy(der, i + 2, s, 0, ls);
        byte[] out = new byte[64];
        System.arraycopy(em32(r), 0, out, 0, 32);
        System.arraycopy(em32(s), 0, out, 32, 32);
        return out;
    }

    @PluginMethod
    public void disponivel(PluginCall call) {
        int r = BiometricManager.from(getContext()).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        JSObject ret = new JSObject();
        ret.put("disponivel", r == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(ret);
    }

    private KeyPair gerar(KeyGenParameterSpec spec) throws Exception {
        KeyPairGenerator g = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
        g.initialize(spec);
        return g.generateKeyPair();
    }

    private KeyGenParameterSpec.Builder especificacao() {
        KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
                .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            b.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        } else {
            b.setUserAuthenticationValidityDurationSeconds(-1);
        }
        return b;
    }

    @PluginMethod
    public void criar(PluginCall call) {
        try {
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
            ks.load(null);
            if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS);

            KeyPair par = null;
            boolean strongbox = false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    && getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)) {
                try {
                    par = gerar(especificacao().setIsStrongBoxBacked(true).build());
                    strongbox = true;
                } catch (StrongBoxUnavailableException e) {
                    par = null;
                }
            }
            if (par == null) par = gerar(especificacao().build());

            KeyFactory kf = KeyFactory.getInstance(par.getPrivate().getAlgorithm(), "AndroidKeyStore");
            KeyInfo info = kf.getKeySpec(par.getPrivate(), KeyInfo.class);
            boolean hardware;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                int nivel = info.getSecurityLevel();
                hardware = nivel == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT || nivel == KeyProperties.SECURITY_LEVEL_STRONGBOX;
            } else {
                hardware = info.isInsideSecureHardware();
            }
            if (!hardware) {
                ks.deleteEntry(ALIAS);
                call.reject("Este celular não tem chip de segurança para guardar a chave do ponto.", "sem_hardware");
                return;
            }

            ECPublicKey pub = (ECPublicKey) par.getPublic();
            JSObject ret = new JSObject();
            ret.put("x", b64url(em32(pub.getW().getAffineX().toByteArray())));
            ret.put("y", b64url(em32(pub.getW().getAffineY().toByteArray())));
            ret.put("hardware", true);
            ret.put("strongbox", strongbox);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Não foi possível criar a chave do ponto: " + e.getMessage(), "erro");
        }
    }

    @PluginMethod
    public void assinar(PluginCall call) {
        final String desafio = call.getString("desafio");
        final String motivo = call.getString("motivo", "Confirme para registrar o ponto");
        if (desafio == null) {
            call.reject("Desafio ausente.", "erro");
            return;
        }
        final Signature assinatura;
        try {
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
            ks.load(null);
            PrivateKey chave = (PrivateKey) ks.getKey(ALIAS, null);
            if (chave == null) {
                call.reject("Chave do ponto não encontrada.", "sem_chave");
                return;
            }
            assinatura = Signature.getInstance("SHA256withECDSA");
            assinatura.initSign(chave);
        } catch (KeyPermanentlyInvalidatedException e) {
            call.reject("Uma digital nova foi cadastrada no celular. Ative a biometria do ponto de novo.", "chave_invalidada");
            return;
        } catch (Exception e) {
            call.reject("Não foi possível usar a chave do ponto: " + e.getMessage(), "erro");
            return;
        }

        getActivity().runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt((FragmentActivity) getActivity(), ContextCompat.getMainExecutor(getContext()),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult resultado) {
                            try {
                                Signature s = resultado.getCryptoObject().getSignature();
                                s.update(desafio.getBytes(StandardCharsets.UTF_8));
                                JSObject ret = new JSObject();
                                ret.put("assinatura", b64url(derParaP1363(s.sign())));
                                call.resolve(ret);
                            } catch (Exception e) {
                                call.reject("Falha ao assinar: " + e.getMessage(), "erro");
                            }
                        }

                        @Override
                        public void onAuthenticationError(int codigo, @NonNull CharSequence mensagem) {
                            boolean cancelado = codigo == BiometricPrompt.ERROR_USER_CANCELED || codigo == BiometricPrompt.ERROR_NEGATIVE_BUTTON || codigo == BiometricPrompt.ERROR_CANCELED;
                            call.reject(mensagem.toString(), cancelado ? "cancelado" : "erro");
                        }
                    });
            BiometricPrompt.PromptInfo infoPrompt = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Meu Ponto")
                    .setSubtitle(motivo)
                    .setNegativeButtonText("Cancelar")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .setConfirmationRequired(false)
                    .build();
            prompt.authenticate(infoPrompt, new BiometricPrompt.CryptoObject(assinatura));
        });
    }

    @PluginMethod
    public void apagar(PluginCall call) {
        try {
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
            ks.load(null);
            if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), "erro");
        }
    }
}
