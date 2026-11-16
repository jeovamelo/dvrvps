@echo off
echo ========================================================
echo  Empacotando DVR TV para Samsung Smart TV (Tizen .wgt)
echo ========================================================
if exist dvrtv.wgt del dvrtv.wgt
tar.exe -a -cf dvrtv.wgt config.xml icon.png index.html css js
if exist dvrtv.wgt (
    echo [SUCESSO] Pacote dvrtv.wgt gerado com sucesso!
) else (
    echo [ERRO] Falha ao gerar dvrtv.wgt.
)
pause
