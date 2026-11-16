# 📺 Guia de Instalação do Aplicativo DVR TV na Samsung Smart TV

Este aplicativo foi desenvolvido especialmente para televisores **Samsung Smart TV (Tizen OS)** para acessar e visualizar em tempo real as câmeras do seu DVR Hikvision (**DVR01Casa**).

---

## 🚀 Método 1: Acesso Imediato pelo Navegador da Samsung TV (Sem Instalar Nada)

Você pode testar e usar o aplicativo instantaneamente na sua TV sem precisar de ferramentas de desenvolvedor:

1. No seu computador (na mesma rede Wi-Fi/cabo da TV), execute o arquivo:
   `cmd
   start-server.bat
   `
2. O prompt mostrará o endereço, por exemplo: http://192.168.100.X:8080/ (descubra o IP do seu computador com ipconfig).
3. Na sua Samsung Smart TV, abra o aplicativo **Navegador de Internet** (Samsung Internet).
4. Digite a URL do seu computador com a porta 8080:
   `	ext
   http://192.168.100.X:8080/
   `
5. O aplicativo abrirá em tela cheia com todas as câmeras funcionando! Você pode usar as setas do controle remoto para navegar e clicar.

---

## 📦 Método 2: Instalação Nativa via Tizen Studio / Tizen CLI (Pacote .wgt)

O arquivo compilado pronto para instalação na TV já foi gerado na pasta:
`	ext
dvrtv.wgt
`

### Passo 1: Habilitar o Modo Desenvolvedor na Samsung Smart TV
1. Ligue a sua TV Samsung e aperte o botão **Home** no controle remoto.
2. Acesse a aba **Apps**.
3. Na tela de Apps, digite no controle remoto a sequência: **1 2 3 4 5**.
4. Uma janela pop-up de **Developer Mode** aparecerá na TV:
   - Marque a opção **On**.
   - No campo **Host PC IP**, digite o endereço IP do seu computador (ex: 192.168.100.15).
   - Clique em **OK**.
5. Reinicie a televisão segurando o botão de ligar/desligar do controle por 5 segundos até o logo da Samsung aparecer (ou tire da tomada por 10 segundos).

### Passo 2: Conectar o Computador à TV com o SDB (Smart Development Bridge)
Caso tenha o **Tizen Studio** instalado no PC:
1. Abra o Prompt de Comando ou PowerShell e execute:
   `cmd
   sdb connect <IP_DA_SUA_TV_SAMSUNG>
   `
   *(Exemplo: sdb connect 192.168.100.50:26101 ou apenas o IP).*
2. Verifique se a TV está listada:
   `cmd
   sdb devices
   `

### Passo 3: Instalar o Pacote dvrtv.wgt
Execute o comando na pasta do projeto:
`cmd
tizen install -n dvrtv.wgt -t <ID_DO_SEU_DEVICE_DA_TV>
`
*O ícone do **DVR TV** aparecerá diretamente na barra de aplicativos (Smart Hub) da sua Samsung TV!*

---

## 🎮 Controles e Atalhos no Controle Remoto da Samsung TV

| Tecla do Controle | Função no Aplicativo |
| :--- | :--- |
| **▲ ▼ ◄ ► (Setas D-Pad)** | Navega entre as câmeras na grade com destaque luminoso |
| **OK / Enter** | Abre a câmera selecionada em **Tela Cheia** / Retorna à grade |
| **Voltar (Return / Back)** | Sai da tela cheia ou fecha o aplicativo |
| **🔴 Tecla Vermelha** | Reconecta ao DVR e atualiza os feeds |
| **🟢 Tecla Verde** | Alterna os modos de grade: **2x2**, **3x3**, **4x4** ou **1x1** |
| **🟡 Tecla Amarela** | Alterna entre qualidade **HD (1080P)** e **Sub-stream Fluido** |
| **🔵 Tecla Azul** | Filtra câmeras: **Apenas Ativas (13)** vs **Todas as Câmeras (16)** |
| **CH ▲ / CH ▼** | Próxima câmera / Câmera anterior diretamente em tela cheia |
| **Teclas 1 a 9 e 0** | Atalho numérico direto para selecionar o canal desejado |

---

## 🔧 Informações Técnicas da Conexão

- **IP do DVR:** 192.168.100.2
- **Porta HTTP:** 80
- **Porta RTSP:** 554
- **Usuário:** dmin
- **Protocolo de Streaming Primário:** RTSP via Hardware Samsung AVPlay (webapis.avplay)
- **Protocolo de Streaming Secundário / Grade:** HTTP ISAPI Snapshot com renovação de sessão SHA-256
