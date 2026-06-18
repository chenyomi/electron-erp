!include nsDialogs.nsh
!include LogicLib.nsh
!include WinMessages.nsh

!ifndef PBM_SETPOS
  !define PBM_SETPOS 0x0402
!endif
!ifndef PBM_SETRANGE32
  !define PBM_SETRANGE32 0x0406
!endif

!ifndef BUILD_UNINSTALLER

Var DonghaoShowcaseDialog
Var DonghaoShowcaseImage
Var DonghaoShowcaseImageHandle
Var DonghaoShowcaseProgress
Var DonghaoShowcaseProgressValue
Var DonghaoShowcaseSlide
Var DonghaoShowcaseTitle
Var DonghaoShowcaseSubtitle

Function DonghaoShowcaseSetText
  ${If} $DonghaoShowcaseSlide == 1
    ${NSD_SetText} $DonghaoShowcaseTitle "一屏看清账务数据"
    ${NSD_SetText} $DonghaoShowcaseSubtitle "现金账、公账、客户往来和承兑票集中管理，少翻表格，少漏记录。"
  ${ElseIf} $DonghaoShowcaseSlide == 2
    ${NSD_SetText} $DonghaoShowcaseTitle "库存和单据同步归档"
    ${NSD_SetText} $DonghaoShowcaseSubtitle "出入库、销售单据、附件图片统一沉淀，查账和交接更轻松。"
  ${Else}
    ${If} $DonghaoShowcaseSlide == 3
      ${NSD_SetText} $DonghaoShowcaseTitle "深色模式适合长时间使用"
      ${NSD_SetText} $DonghaoShowcaseSubtitle "现金账流水、筛选、导出和分页都在本地完成，夜间录入更舒服。"
    ${Else}
      ${NSD_SetText} $DonghaoShowcaseTitle "中英文界面随时切换"
      ${NSD_SetText} $DonghaoShowcaseSubtitle "同一套账务数据，中文和 English 模式都能快速上手。"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function DonghaoShowcaseSetImage
  ${If} $DonghaoShowcaseImageHandle <> 0
    System::Call 'gdi32::DeleteObject(p r$DonghaoShowcaseImageHandle)'
    StrCpy $DonghaoShowcaseImageHandle 0
  ${EndIf}

  ${If} $DonghaoShowcaseSlide == 1
    ${NSD_SetImage} $DonghaoShowcaseImage "$PLUGINSDIR\installer-showcase-1.bmp" $DonghaoShowcaseImageHandle
  ${ElseIf} $DonghaoShowcaseSlide == 2
    ${NSD_SetImage} $DonghaoShowcaseImage "$PLUGINSDIR\installer-showcase-2.bmp" $DonghaoShowcaseImageHandle
  ${ElseIf} $DonghaoShowcaseSlide == 3
    ${NSD_SetImage} $DonghaoShowcaseImage "$PLUGINSDIR\installer-showcase-3.bmp" $DonghaoShowcaseImageHandle
  ${Else}
    ${NSD_SetImage} $DonghaoShowcaseImage "$PLUGINSDIR\installer-showcase-4.bmp" $DonghaoShowcaseImageHandle
  ${EndIf}
FunctionEnd

Function DonghaoShowcaseTick
  IntOp $DonghaoShowcaseProgressValue $DonghaoShowcaseProgressValue + 5
  ${If} $DonghaoShowcaseProgressValue > 100
    StrCpy $DonghaoShowcaseProgressValue 8
  ${EndIf}
  SendMessage $DonghaoShowcaseProgress ${PBM_SETPOS} $DonghaoShowcaseProgressValue 0

  IntOp $0 $DonghaoShowcaseProgressValue % 35
  ${If} $0 == 0
    IntOp $DonghaoShowcaseSlide $DonghaoShowcaseSlide + 1
    ${If} $DonghaoShowcaseSlide > 4
      StrCpy $DonghaoShowcaseSlide 1
    ${EndIf}
    Call DonghaoShowcaseSetText
    Call DonghaoShowcaseSetImage
  ${EndIf}
FunctionEnd

Function DonghaoShowcaseCreate
  nsDialogs::Create 1018
  Pop $DonghaoShowcaseDialog
  ${If} $DonghaoShowcaseDialog == error
    Abort
  ${EndIf}

  InitPluginsDir
  File /oname=$PLUGINSDIR\installer-showcase-1.bmp "${__FILEDIR__}\..\resources\installer-showcase-1.bmp"
  File /oname=$PLUGINSDIR\installer-showcase-2.bmp "${__FILEDIR__}\..\resources\installer-showcase-2.bmp"
  File /oname=$PLUGINSDIR\installer-showcase-3.bmp "${__FILEDIR__}\..\resources\installer-showcase-3.bmp"
  File /oname=$PLUGINSDIR\installer-showcase-4.bmp "${__FILEDIR__}\..\resources\installer-showcase-4.bmp"

  StrCpy $DonghaoShowcaseSlide 1
  StrCpy $DonghaoShowcaseProgressValue 18
  StrCpy $DonghaoShowcaseImageHandle 0

  SetCtlColors $DonghaoShowcaseDialog 0xE8F0FF 0x07111F

  ${NSD_CreateBitmap} 0u 0u 100% 138u ""
  Pop $DonghaoShowcaseImage
  Call DonghaoShowcaseSetImage

  ${NSD_CreateLabel} 0u 144u 100% 14u "一屏看清账务数据"
  Pop $DonghaoShowcaseTitle
  SetCtlColors $DonghaoShowcaseTitle 0xFFFFFF 0x07111F

  ${NSD_CreateLabel} 0u 162u 100% 13u "现金账、公账、客户往来和承兑票集中管理，少翻表格，少漏记录。"
  Pop $DonghaoShowcaseSubtitle
  SetCtlColors $DonghaoShowcaseSubtitle 0x91A4BF 0x07111F

  ${NSD_CreateProgressBar} 0u 182u 100% 6u ""
  Pop $DonghaoShowcaseProgress
  SendMessage $DonghaoShowcaseProgress ${PBM_SETRANGE32} 0 100
  SendMessage $DonghaoShowcaseProgress ${PBM_SETPOS} $DonghaoShowcaseProgressValue 0

  ${NSD_CreateTimer} DonghaoShowcaseTick 700
  nsDialogs::Show
FunctionEnd

Function DonghaoShowcaseLeave
  ${NSD_KillTimer} DonghaoShowcaseTick
  ${If} $DonghaoShowcaseImageHandle <> 0
    System::Call 'gdi32::DeleteObject(p r$DonghaoShowcaseImageHandle)'
    StrCpy $DonghaoShowcaseImageHandle 0
  ${EndIf}
FunctionEnd

!macro customPageBeforeInstall
  Page custom DonghaoShowcaseCreate DonghaoShowcaseLeave
!macroend

!endif
