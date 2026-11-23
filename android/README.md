# Love Flix — Aplicativo Android Nativo

Aplicativo Android nativo da plataforma **Love Flix** (`https://love-flix.vercel.app`), com:

- **Ícone oficial** configurado em todas as densidades (`mdpi`, `hdpi`, `xhdpi`, `xxhdpi`, `xxxhdpi`) preservando a imagem original enviada.
- **Bloqueador de anúncios e pop-ups integrado (`AdBlocker.kt`)**: filtra scripts, rastreadores, redirecionamentos externos e bloqueia novas abas/pop-ups nos embeds dos Canais 2 e 3 **sem precisar configurar DNS** no aparelho.
- **Tela cheia imersiva real (`MainActivity.kt`)**: oculta barras do sistema com suporte a recorte de câmera (`shortEdges`), rotação automática para paisagem quando o vídeo entra em tela cheia e mantém a tela ligada durante a reprodução.

---

## Como gerar o `LoveFlix.apk` sem precisar de PC (pelo GitHub)

1. Crie um repositório no GitHub (pode ser privado) e envie os arquivos deste projeto (ou apenas a pasta `android/` junto com `.github/workflows/build-android-apk.yml`).
2. Abra a aba **Actions** do seu repositório no GitHub.
3. Clique em **Gerar APK Love Flix (Android)** e depois em **Run workflow** (ou aguarde finalizar se já iniciou automaticamente no push).
4. Quando terminar (~3 minutos), clique na execução concluída, role até **Artifacts** e baixe **`LoveFlix-APK`** (que contém o arquivo `LoveFlix.apk` pronto para instalar no celular).

> **Pelo Android Studio (no PC):** basta abrir a pasta `android/` no Android Studio e usar **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

---

## Como funcionam as atualizações depois que o app estiver instalado

1. **Mudanças no site / catálogo / player / Sessão Flix:** aparecem **automaticamente** dentro do app assim que você publica o site (`https://love-flix.vercel.app`), **sem precisar gerar novo APK**.
2. **Mudanças nativas no app** (novos filtros no `AdBlocker.kt`, ícone, nome ou configurações do Android):
   - Aumente `versionCode` em `android/app/build.gradle.kts` (ex.: de `1` para `2`) e `versionName` (ex.: `"1.0.1"`).
   - Gere o novo APK mantendo o mesmo `applicationId` (`com.loveflix.app`) e mesma assinatura — ao instalar no celular, o Android atualiza por cima sem desinstalar o app nem perder o login.
