!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "是否同时删除本机账本数据？$\r$\n$\r$\n选择“是”会删除本机 ledger-data 目录，包括账本数据库、附件图片、本机备份和七牛云配置。$\r$\n$\r$\n如未提前导出备份包，请选择“否”。" IDNO keepDonghaoLedgerData

    SetShellVarContext current
    !ifdef APP_PRODUCT_FILENAME
      RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}\ledger-data"
      RMDir "$APPDATA\${APP_PRODUCT_FILENAME}"
    !endif
    !ifdef APP_FILENAME
      RMDir /r "$APPDATA\${APP_FILENAME}\ledger-data"
      RMDir "$APPDATA\${APP_FILENAME}"
    !endif
    !ifdef APP_PACKAGE_NAME
      RMDir /r "$APPDATA\${APP_PACKAGE_NAME}\ledger-data"
      RMDir "$APPDATA\${APP_PACKAGE_NAME}"
    !endif

keepDonghaoLedgerData:
  ${endif}
!macroend
