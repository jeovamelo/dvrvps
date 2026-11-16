# ==============================================================================
# Script de Configuracao MikroTik RouterOS para DVR Hikvision + VPS
# IP da VPS Autorizada: 206.42.26.134
# IP do DVR na Rede Local: 192.168.100.2
# ==============================================================================

# 1. Regra de NAT para comunicacao HTTP / ISAPI (Porta 8088 externa -> Porta 80 do DVR)
/ip firewall nat
add chain=dstnat action=dst-nat to-addresses=192.168.100.2 to-ports=80 \
    protocol=tcp dst-port=8088 src-address=206.42.26.134 \
    comment="DVR ISAPI exclusivo VPS 206.42.26.134"

# 2. Regra de NAT para transmissao RTSP de video (Porta 554 externa -> Porta 554 do DVR)
add chain=dstnat action=dst-nat to-addresses=192.168.100.2 to-ports=554 \
    protocol=tcp dst-port=554 src-address=206.42.26.134 \
    comment="DVR RTSP exclusivo VPS 206.42.26.134"

# 3. Regra de Firewall Filter para autorizar o trafego encaminhado vindo da VPS
/ip firewall filter
add chain=forward action=accept connection-nat-state=dstnat \
    src-address=206.42.26.134 \
    comment="Permitir trafego da VPS 206.42.26.134 para DVR" place-before=1
