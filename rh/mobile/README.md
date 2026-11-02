# App "Meu Ponto" para iPhone e Android

App nativo do Nexor RH, feito com [Capacitor](https://capacitorjs.com) 8. Ele abre o app do trabalhador
(`/app/` do servidor) e usa os recursos nativos do celular:

| Recurso | Como funciona no app nativo |
| --- | --- |
| **Biometria** | Digital ou Face ID do sistema. O app cria uma chave guardada no cofre do celular (Keychain no iPhone, Keystore no Android), presa a este aparelho, e só a usa depois da biometria. O servidor confere a assinatura. A digital e o rosto nunca saem do celular. |
| **QR Code** | Leitor de código nativo (`@capacitor/barcode-scanner`). Funciona no iPhone e no Android. |
| **GPS** | Localização nativa, pedida só na hora de bater o ponto. |
| **Link do QR abre o app** | O QR do quiosque é um link `https://SEU-SERVIDOR/app/?q=…`. Com o app instalado, a câmera do celular abre direto o app (Android App Links e iOS Universal Links). |
| **Atualizações** | As telas vêm do servidor: melhorias chegam a todos sem nova versão nas lojas. Só recursos nativos novos exigem publicar de novo. |

No navegador (sem instalar), o mesmo `/app/` continua funcionando como PWA, com WebAuthn para a biometria.

## O que você precisa (contas das lojas)

- **Google Play Console**: cadastro de desenvolvedor, taxa única de US$ 25 (play.google.com/console).
- **Apple Developer Program**: US$ 99 por ano (developer.apple.com/programs). Sem ele não é possível instalar no iPhone fora do Xcode.
- **Servidor do Nexor RH publicado com HTTPS** (ex.: `https://rh.nexorconsultingit.com.br`).

Para o Android também dá para distribuir o APK direto (sem loja), pela página `/baixar` do servidor. No iPhone, a Apple só permite instalar pela App Store ou pelo TestFlight.

## Compilar sem ter Mac nem Android Studio (GitHub Actions)

O workflow `.github/workflows/app-meu-ponto.yml` compila nos servidores do GitHub:

1. Em **Settings → Secrets and variables → Actions → Variables**, crie `NEXOR_RH_URL` com o endereço do servidor.
2. Em **Actions → App Meu Ponto → Run workflow**.
3. No fim, baixe os arquivos em **Artifacts**:
   - Sem chaves configuradas: `meu-ponto-teste.apk`, que instala em qualquer Android para teste. O iOS só confere se compila.
   - Com as chaves (abaixo): `meu-ponto.apk` e `meu-ponto.aab` assinados (o `.aab` é o que vai para o Google Play) e `App.ipa` para a App Store.

### Chave de assinatura do Android (uma vez só, guarde para sempre)

```bash
keytool -genkeypair -v -keystore meu-ponto.jks -alias meuponto -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 meu-ponto.jks   # cole o resultado no secret ANDROID_KEYSTORE_BASE64
```

Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`meuponto`) e `ANDROID_KEY_PASSWORD`.
**Se perder esse arquivo, não dá mais para atualizar o app no Google Play** (a não ser com a assinatura gerenciada pelo Google Play, que é o recomendado ao criar o app no Console).

### Certificado do iOS

No portal da Apple (Certificates, Identifiers & Profiles):

1. **Identifiers**: crie o App ID `br.com.nexorconsultingit.ponto`, com a capacidade **Associated Domains** ligada.
2. **Certificates**: crie um "Apple Distribution". Exporte o `.p12` pelo Acesso às Chaves do Mac.
3. **Profiles**: crie um perfil "App Store Connect" para o App ID.

Secrets: `IOS_CERTIFICATE_P12_BASE64` (`base64 -i cert.p12`), `IOS_CERTIFICATE_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64` e `APPLE_TEAM_ID`.
Envie o `.ipa` gerado pelo app **Transporter** (Mac) ou pelo Xcode para o App Store Connect e distribua pelo TestFlight ou pela loja.

## Fazer o QR Code abrir o app (links verificados)

No servidor do Nexor RH (variáveis de ambiente):

- `APP_ID=br.com.nexorconsultingit.ponto`
- `ANDROID_SHA256=` impressão digital SHA-256 do certificado de assinatura. Com a assinatura do Google Play, pegue em Play Console → Integridade do app. Serve também `keytool -list -v -keystore meu-ponto.jks`.
- `APPLE_TEAM_ID=` seu Team ID.

O servidor passa a publicar `/.well-known/assetlinks.json` e `/.well-known/apple-app-site-association`.
No iPhone, a capacidade **Associated Domains** precisa estar no App ID e no perfil. O arquivo `ios/App/App/App.entitlements` já vem pronto; no Xcode, em *Signing & Capabilities*, adicione "Associated Domains" e aponte para ele.

## Página de download

`https://SEU-SERVIDOR/baixar` mostra os botões da App Store, do Google Play e do APK, conforme `APP_STORE_URL`, `PLAY_STORE_URL` e `APK_URL`. O convite do app enviado pelo RH já aponta para essa página.

## Publicar nas lojas: o que preparar

- **Política de privacidade**: `https://SEU-SERVIDOR/privacidade.html` (modelo pronto, peça ao jurídico para revisar).
- **Google Play, seção "Segurança dos dados"**: localização aproximada e exata (só na hora do ponto), fotos (atestados, opcional), identificadores (CPF, matrícula). Sem compartilhamento para publicidade. Dados criptografados em trânsito.
- **App Store, "Privacidade do app"**: os mesmos dados, "vinculados ao usuário", finalidade "funcionalidade do app".
- **Conta de teste para a revisão da Apple e do Google**: deixe um colaborador de demonstração e informe CPF + código de ativação no campo de observações da revisão. A localização e o QR podem barrar o revisor: crie um local **sem** "exigir GPS" e "exigir QR" para essa conta.
- **Capturas de tela**: iPhone 6,7" e 6,5", e Android telefone.

## Desenvolvimento local

```bash
cd rh/mobile
npm install
NEXOR_RH_URL=https://seu-servidor npm run sync
npm run android   # abre no Android Studio
npm run ios       # abre no Xcode (precisa de Mac)
npm run icones    # gera ícones e tela de abertura a partir de assets/
```

Para outro nome ou identificador (app com a marca do cliente): defina `APP_NAME` e `APP_ID` antes do `sync` e ajuste o `applicationId` em `android/app/build.gradle` e o *Bundle Identifier* no Xcode.
