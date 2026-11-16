# 📹 DVR TV - Aplicativo Samsung Smart TV para Câmeras Hikvision

Aplicativo nativo para **Samsung Smart TV (Tizen OS)** projetado para monitoramento em tempo real das câmeras do DVR localizado em http://192.168.100.2/.

---

## 🔍 Diagnóstico do Sistema DVR

Acessamos a interface web e inspecionamos as APIs do equipamento:
- **Dispositivo:** DVR Hikvision AcuSense Turbo HD
- **Modelo:** iDS-7216HQHI-M1/XT
- **Nome do Dispositivo:** DVR01Casa
- **Firmware:** V4.83.301 build 241028
- **Total de Canais:** 16 canais de vídeo analógico
  - **Câmeras Ativas (1080P 25/30fps):** Câmeras 01, 02, 03, 04, 05, 06, 09, 11, 12, 13, 14, 15, 16 (13 câmeras com sinal de vídeo).
  - **Canais sem sinal:** Câmeras 07, 08 e 10 (NO VIDEO).
- **Portas de Rede:**
  - HTTP: 80
  - RTSP: 554 (habilitado para streaming H.264/H.265 de alta definição)
  - DEV_MANAGE: 8000
  - WebSocket: 7681
- **URLs de Streaming RTSP:**
  - Stream Principal (HD 1080P): tsp://admin:jr130182@192.168.100.2:554/Streaming/Channels/{canal}01
  - Sub-stream (Fluido): tsp://admin:jr130182@192.168.100.2:554/Streaming/Channels/{canal}02
- **Autenticação:** Hikvision ISAPI com desafio criptográfico SHA-256 e sessão SessionTag / WebSession.

---

## 🏗️ Estrutura do Aplicativo Samsung Smart TV

`	ext
c:\Users\jeova\.gemini\antigravity\brain\dvrtv\
├── config.xml                  # Manifesto Tizen (privilégios de rede, AVPlay e TV input)
├── dvrtv.wgt                   # Pacote compilado pronto para instalação na TV Samsung
├── icon.png                    # Ícone de inicialização para o Smart Hub da TV
├── index.html                  # Interface gráfica otimizada para TV (1920x1080)
├── css/
│   └── style.css               # Estilos com design de monitor de segurança CCTV
├── js/
│   ├── sha256.js               # Implementação pura de SHA-256 para login no DVR
│   ├── dvr-api.js              # Cliente ISAPI (login, heartbeat, canais e snapshots)
│   ├── avplayer.js             # Player de vídeo com Samsung AVPlay (RTSP) e fallback
│   ├── remote-keys.js          # Mapeamento completo do controle remoto da TV Samsung
│   └── app.js                  # Lógica da aplicação, navegação D-Pad e controle de grades
├── build-package.bat           # Script para reempacotar o dvrtv.wgt caso faça alterações
├── start-server.bat            # Servidor local para abrir o app no navegador da TV imediatamente
├── COMO_INSTALAR_SAMSUNG_TV.md # Instruções completas para instalar na TV Samsung
└── README.md                   # Esta documentação
`

---

## ✨ Recursos do Aplicativo

1. **Decodificação Nativa por Hardware (Samsung AVPlay):**
   - Transmissão RTSP direta em 1080p a 30fps sem travamentos ao abrir em tela cheia.
2. **Modo de Grade Multi-Câmeras:**
   - Suporta grades **2x2** (4 câmeras), **3x3** (9 câmeras), **4x4** (16 câmeras) e **1x1** (única).
3. **Filtro Inteligente de Câmeras:**
   - Permite alternar (via tecla Azul do controle) entre exibir todas as 16 câmeras ou apenas as 13 câmeras com sinal de vídeo ativo.
4. **Navegação 100% via Controle Remoto:**
   - Setas do controle para navegar na grade com borda de foco azul luminosa.
   - Botão OK para tela cheia e voltar para a grade.
   - Botões coloridos (Vermelho: Reconectar, Verde: Layout, Amarelo: HD/Fluido, Azul: Filtro).
   - Botões Canal +/- para alternar câmeras sem sair da tela cheia.
   - Teclas numéricas (1 a 9) para acesso direto ao canal.
