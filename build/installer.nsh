; ================================================================
; CUSTOM NSIS INSTALLER SCRIPT FOR ELECTRON POC
; ================================================================
; This is a fully customized installer with:
; - Custom welcome page with branding
; - Pre-installation system requirements validation page
; - Visual feedback for each requirement check
; - Professional error handling
; - Modern UI with custom dialogs
; ================================================================

!include "LogicLib.nsh"
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

; ================================================================
; GLOBAL VARIABLES
; ================================================================
Var /GLOBAL OS_VERSION_MAJOR
Var /GLOBAL OS_VERSION_MINOR
Var /GLOBAL OS_BUILD
Var /GLOBAL SYSTEM_RAM_GB
Var /GLOBAL FREE_DISK_SPACE_GB
Var /GLOBAL IS_ADMIN
Var /GLOBAL ARCHITECTURE
Var /GLOBAL VALIDATION_PASSED
Var /GLOBAL VALIDATION_MESSAGE

; UI Control Handles for Custom Page
Var /GLOBAL Dialog
Var /GLOBAL Label_Title
Var /GLOBAL Label_Subtitle
Var /GLOBAL Label_OS
Var /GLOBAL Label_Arch
Var /GLOBAL Label_RAM
Var /GLOBAL Label_Disk
Var /GLOBAL Label_Admin
Var /GLOBAL Label_Result
Var /GLOBAL Check_OS
Var /GLOBAL Check_Arch
Var /GLOBAL Check_RAM
Var /GLOBAL Check_Disk
Var /GLOBAL Check_Admin
Var /GLOBAL ProgressBar

; ================================================================
; MINIMUM REQUIREMENTS CONFIGURATION
; ================================================================
; Customize these values to match your application's needs
!define APP_NAME "Electron POC"
!define APP_PUBLISHER "Presidio"
!define MIN_OS_MAJOR 10
!define MIN_OS_BUILD 10240
!define MIN_RAM_GB 4
!define MIN_DISK_SPACE_GB 2
!define REQUIRED_ARCH "x64"

; ================================================================
; SYSTEM REQUIREMENT CHECK FUNCTIONS
; ================================================================

; Function to check Windows version (silent, returns status)
Function CheckWindowsVersion
  Push $R0
  
  ; Get Windows version using System plugin
  System::Call 'kernel32::GetVersion() i .r0'
  IntOp $OS_VERSION_MAJOR $0 & 0xFF
  IntOp $OS_VERSION_MINOR $0 & 0xFF00
  IntOp $OS_VERSION_MINOR $OS_VERSION_MINOR / 256
  
  ; Get build number from registry
  ReadRegStr $OS_BUILD HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
  ${If} $OS_BUILD == ""
    ReadRegStr $OS_BUILD HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuild"
  ${EndIf}
  
  ; Convert build number to integer for comparison
  IntOp $R0 0 + $OS_BUILD
  
  ; Check if Windows 10 or later and build number meets minimum
  ${If} $OS_VERSION_MAJOR < ${MIN_OS_MAJOR}
    StrCpy $VALIDATION_PASSED "0"
    StrCpy $VALIDATION_MESSAGE "Failed: Requires Windows ${MIN_OS_MAJOR} or later$\nFound: Windows $OS_VERSION_MAJOR.$OS_VERSION_MINOR"
    Pop $R0
    Return
  ${EndIf}
  
  ${If} $R0 < ${MIN_OS_BUILD}
    StrCpy $VALIDATION_PASSED "0"
    StrCpy $VALIDATION_MESSAGE "Failed: Requires Windows 10 Build ${MIN_OS_BUILD}+$\nFound: Build $OS_BUILD"
    Pop $R0
    Return
  ${EndIf}
  
  StrCpy $VALIDATION_PASSED "1"
  DetailPrint "✓ Windows version: $OS_VERSION_MAJOR.$OS_VERSION_MINOR (Build $OS_BUILD)"
  
  Pop $R0
FunctionEnd

; Function to check system architecture (64-bit, silent)
Function CheckArchitecture
  Push $0
  
  ; Check processor architecture from registry
  ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "PROCESSOR_ARCHITECTURE"
  ${If} $0 == ""
    ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "PROCESSOR_ARCHITEW6432"
  ${EndIf}
  
  ; Check if 64-bit (AMD64 or x64)
  ${If} $0 == "AMD64"
    StrCpy $ARCHITECTURE "x64"
    StrCpy $VALIDATION_PASSED "1"
    DetailPrint "✓ Architecture: 64-bit (AMD64)"
  ${ElseIf} $0 == "x64"
    StrCpy $ARCHITECTURE "x64"
    StrCpy $VALIDATION_PASSED "1"
    DetailPrint "✓ Architecture: 64-bit (x64)"
  ${Else}
    StrCpy $VALIDATION_PASSED "0"
    StrCpy $VALIDATION_MESSAGE "Failed: Requires 64-bit (x64) architecture$\nFound: $0"
  ${EndIf}
  
  Pop $0
FunctionEnd

; Function to check system RAM (silent)
Function CheckRAM
  Push $0
  Push $1
  Push $R2
  Push $R3
  Push $R4
  Push $R5
  Push $R6
  
  ; Use System plugin with GlobalMemoryStatusEx
  ClearErrors
  System::Call '*(&i64 0) i .r0'
  ${If} ${Errors}
    StrCpy $SYSTEM_RAM_GB ${MIN_RAM_GB}
    StrCpy $VALIDATION_PASSED "1"
    DetailPrint "⚠ RAM: Could not detect, assuming ${MIN_RAM_GB}GB"
    Goto CheckRAM_End
  ${EndIf}
  ${If} $r0 == 0
    StrCpy $SYSTEM_RAM_GB ${MIN_RAM_GB}
    StrCpy $VALIDATION_PASSED "1"
    DetailPrint "⚠ RAM: Could not detect, assuming ${MIN_RAM_GB}GB"
    Goto CheckRAM_End
  ${EndIf}
  
  ; Set dwLength = 64 (first 4 bytes)
  System::Call '*$0(i 64)'
  ${If} ${Errors}
    System::Free $0
    StrCpy $SYSTEM_RAM_GB ${MIN_RAM_GB}
    StrCpy $VALIDATION_PASSED "1"
    DetailPrint "⚠ RAM: Could not detect, assuming ${MIN_RAM_GB}GB"
    Goto CheckRAM_End
  ${EndIf}
  
  ; Call GlobalMemoryStatusEx
  System::Call 'kernel32::GlobalMemoryStatusEx(i r0) i .r1'
  
  ${If} $r1 != 0
    ; Successfully called - read ullTotalPhys (8 bytes starting at offset 8)
    IntOp $R2 $r0 + 8
    System::Call '*$R2(i .r3, i .r4)'
    System::Free $0
    
    ; Handle 64-bit value: r3 = low 32 bits, r4 = high 32 bits
    ${If} $r4 > 0
      IntOp $R5 $r4 * 4
      IntOp $R6 $r3 / 1073741824
      IntOp $R5 $R5 + $R6
      StrCpy $SYSTEM_RAM_GB $R5
    ${Else}
      IntOp $R5 $r3 / 1073741824
      StrCpy $SYSTEM_RAM_GB $R5
    ${EndIf}
    
    ; Validate RAM
    ${If} $SYSTEM_RAM_GB < ${MIN_RAM_GB}
      StrCpy $VALIDATION_PASSED "0"
      StrCpy $VALIDATION_MESSAGE "Failed: Minimum ${MIN_RAM_GB}GB RAM required$\nFound: $SYSTEM_RAM_GB GB"
    ${Else}
      StrCpy $VALIDATION_PASSED "1"
      DetailPrint "✓ RAM: $SYSTEM_RAM_GB GB available"
    ${EndIf}
  ${Else}
    System::Free $0
    StrCpy $SYSTEM_RAM_GB ${MIN_RAM_GB}
    StrCpy $VALIDATION_PASSED "1"
    DetailPrint "⚠ RAM: Could not detect, assuming ${MIN_RAM_GB}GB"
  ${EndIf}
  
  CheckRAM_End:
  Pop $R6
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $1
  Pop $0
FunctionEnd


; Function to check free disk space (silent)
Function CheckDiskSpace
  Push $R0
  Push $R1
  Push $1
  Push $2
  Push $3
  
  ; Get the root drive of the installation directory
  StrCpy $R0 "$INSTDIR" 3
  
  ; Use System plugin to get free disk space
  System::Call 'kernel32::GetDiskFreeSpaceEx(t "$R0", *l .r1, *l .r2, *l .r3)'
  
  ; r1 contains free bytes available to caller
  ; Convert to GB (divide by 1073741824 = 1024^3)
  IntOp $R1 $r1 / 1073741824
  StrCpy $FREE_DISK_SPACE_GB $R1
  
  ${If} $FREE_DISK_SPACE_GB < ${MIN_DISK_SPACE_GB}
    StrCpy $VALIDATION_PASSED "0"
    StrCpy $VALIDATION_MESSAGE "Failed: Minimum ${MIN_DISK_SPACE_GB}GB free space required$\nAvailable on $R0: $FREE_DISK_SPACE_GB GB"
  ${Else}
    StrCpy $VALIDATION_PASSED "1"
    DetailPrint "✓ Disk Space: $FREE_DISK_SPACE_GB GB available on $R0"
  ${EndIf}
  
  Pop $3
  Pop $2
  Pop $1
  Pop $R1
  Pop $R0
FunctionEnd

; Function to check administrator privileges (silent)
Function CheckAdminPrivileges
  Push $0
  
  ClearErrors
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion" "ProgramFilesDir"
  ${If} ${Errors}
    StrCpy $IS_ADMIN "Unknown"
    StrCpy $VALIDATION_PASSED "1"
    DetailPrint "⚠ Admin: Assumed (electron-builder requires admin)"
  ${Else}
    StrCpy $IS_ADMIN "Yes"
    StrCpy $VALIDATION_PASSED "1"
    DetailPrint "✓ Administrator: Privileges confirmed"
  ${EndIf}
  
  Pop $0
FunctionEnd

; ================================================================
; CUSTOM PAGE: SYSTEM REQUIREMENTS VALIDATION
; ================================================================

; Create the custom requirements validation page
Function RequirementsPageCreate
  !insertmacro MUI_HEADER_TEXT "System Requirements Validation" "Checking if your system meets the minimum requirements..."
  
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}
  
  ; Title Label
  ${NSD_CreateLabel} 0 0 100% 16u "${APP_NAME} - Pre-Installation System Check"
  Pop $Label_Title
  CreateFont $R0 "Arial" 12 700
  SendMessage $Label_Title ${WM_SETFONT} $R0 0
  
  ; Subtitle
  ${NSD_CreateLabel} 0 20u 100% 12u "Verifying that your system meets the minimum requirements..."
  Pop $Label_Subtitle
  
  ; Progress Bar
  ${NSD_CreateProgressBar} 0 40u 100% 12u ""
  Pop $ProgressBar
  
  ; Requirement Check Labels
  ${NSD_CreateLabel} 10u 65u 20u 12u "[ ? ]"
  Pop $Check_OS
  ${NSD_CreateLabel} 35u 65u 90% 12u "Windows Version: Checking..."
  Pop $Label_OS
  
  ${NSD_CreateLabel} 10u 82u 20u 12u "[ ? ]"
  Pop $Check_Arch
  ${NSD_CreateLabel} 35u 82u 90% 12u "System Architecture: Checking..."
  Pop $Label_Arch
  
  ${NSD_CreateLabel} 10u 99u 20u 12u "[ ? ]"
  Pop $Check_RAM
  ${NSD_CreateLabel} 35u 99u 90% 12u "System RAM: Checking..."
  Pop $Label_RAM
  
  ${NSD_CreateLabel} 10u 116u 20u 12u "[ ? ]"
  Pop $Check_Disk
  ${NSD_CreateLabel} 35u 116u 90% 12u "Disk Space: Checking..."
  Pop $Label_Disk
  
  ${NSD_CreateLabel} 10u 133u 20u 12u "[ ? ]"
  Pop $Check_Admin
  ${NSD_CreateLabel} 35u 133u 90% 12u "Administrator Privileges: Checking..."
  Pop $Label_Admin
  
  ; Result Label (will be updated after checks)
  ${NSD_CreateLabel} 0 155u 100% 24u ""
  Pop $Label_Result
  CreateFont $R1 "Arial" 10 700
  SendMessage $Label_Result ${WM_SETFONT} $R1 0
  
  ; Perform checks after showing the dialog
  nsDialogs::Show
FunctionEnd

; Perform validation checks with visual feedback
Function RequirementsPageLeave
  Var /GLOBAL AllChecksPassed
  StrCpy $AllChecksPassed "1"
  
  ; Update progress: 0%
  SendMessage $ProgressBar ${PBM_SETPOS} 0 0
  
  ; ============ Check 1: Windows Version ============
  Sleep 300
  Call CheckWindowsVersion
  ${If} $VALIDATION_PASSED == "1"
    SendMessage $Check_OS ${WM_SETTEXT} 0 "STR:[✓]"
    SendMessage $Label_OS ${WM_SETTEXT} 0 "STR:Windows Version: $OS_VERSION_MAJOR.$OS_VERSION_MINOR (Build $OS_BUILD) ✓"
  ${Else}
    SendMessage $Check_OS ${WM_SETTEXT} 0 "STR:[✗]"
    SendMessage $Label_OS ${WM_SETTEXT} 0 "STR:Windows Version: FAILED"
    StrCpy $AllChecksPassed "0"
  ${EndIf}
  SendMessage $ProgressBar ${PBM_SETPOS} 20 0
  
  ; ============ Check 2: Architecture ============
  Sleep 300
  Call CheckArchitecture
  ${If} $VALIDATION_PASSED == "1"
    SendMessage $Check_Arch ${WM_SETTEXT} 0 "STR:[✓]"
    SendMessage $Label_Arch ${WM_SETTEXT} 0 "STR:System Architecture: 64-bit (x64) ✓"
  ${Else}
    SendMessage $Check_Arch ${WM_SETTEXT} 0 "STR:[✗]"
    SendMessage $Label_Arch ${WM_SETTEXT} 0 "STR:System Architecture: FAILED"
    StrCpy $AllChecksPassed "0"
  ${EndIf}
  SendMessage $ProgressBar ${PBM_SETPOS} 40 0
  
  ; ============ Check 3: RAM ============
  Sleep 300
  Call CheckRAM
  ${If} $VALIDATION_PASSED == "1"
    SendMessage $Check_RAM ${WM_SETTEXT} 0 "STR:[✓]"
    SendMessage $Label_RAM ${WM_SETTEXT} 0 "STR:System RAM: $SYSTEM_RAM_GB GB ✓"
  ${Else}
    SendMessage $Check_RAM ${WM_SETTEXT} 0 "STR:[✗]"
    SendMessage $Label_RAM ${WM_SETTEXT} 0 "STR:System RAM: FAILED ($SYSTEM_RAM_GB GB < ${MIN_RAM_GB} GB)"
    StrCpy $AllChecksPassed "0"
  ${EndIf}
  SendMessage $ProgressBar ${PBM_SETPOS} 60 0
  
  ; ============ Check 4: Disk Space ============
  Sleep 300
  Call CheckDiskSpace
  ${If} $VALIDATION_PASSED == "1"
    SendMessage $Check_Disk ${WM_SETTEXT} 0 "STR:[✓]"
    SendMessage $Label_Disk ${WM_SETTEXT} 0 "STR:Disk Space: $FREE_DISK_SPACE_GB GB available ✓"
  ${Else}
    SendMessage $Check_Disk ${WM_SETTEXT} 0 "STR:[✗]"
    SendMessage $Label_Disk ${WM_SETTEXT} 0 "STR:Disk Space: FAILED"
    StrCpy $AllChecksPassed "0"
  ${EndIf}
  SendMessage $ProgressBar ${PBM_SETPOS} 80 0
  
  ; ============ Check 5: Administrator ============
  Sleep 300
  Call CheckAdminPrivileges
  ${If} $VALIDATION_PASSED == "1"
    SendMessage $Check_Admin ${WM_SETTEXT} 0 "STR:[✓]"
    SendMessage $Label_Admin ${WM_SETTEXT} 0 "STR:Administrator Privileges: Confirmed ✓"
  ${Else}
    SendMessage $Check_Admin ${WM_SETTEXT} 0 "STR:[⚠]"
    SendMessage $Label_Admin ${WM_SETTEXT} 0 "STR:Administrator Privileges: Warning"
    ; Admin check doesn't fail installation
  ${EndIf}
  SendMessage $ProgressBar ${PBM_SETPOS} 100 0
  
  ; ============ Final Result ============
  Sleep 500
  ${If} $AllChecksPassed == "1"
    SendMessage $Label_Result ${WM_SETTEXT} 0 "STR:✓ All requirements met! Installation can proceed."
    DetailPrint "========================================="
    DetailPrint "✓ SYSTEM REQUIREMENTS CHECK: PASSED"
    DetailPrint "========================================="
  ${Else}
    SendMessage $Label_Result ${WM_SETTEXT} 0 "STR:✗ System requirements not met. Installation cannot continue."
    DetailPrint "========================================="
    DetailPrint "✗ SYSTEM REQUIREMENTS CHECK: FAILED"
    DetailPrint "========================================="
    Sleep 1000
    MessageBox MB_OK|MB_ICONSTOP "System Requirements Not Met$\n$\n$VALIDATION_MESSAGE$\n$\nInstallation cannot continue.$\n$\nPlease upgrade your system and try again." /SD IDOK
    Quit
  ${EndIf}
FunctionEnd

; ================================================================
; CUSTOM WELCOME PAGE
; ================================================================

Function CustomWelcomePageCreate
  !insertmacro MUI_HEADER_TEXT "Welcome to ${APP_NAME} Setup" "System Requirements Pre-Check"
  
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}
  
  ; Welcome Title
  ${NSD_CreateLabel} 0 0 100% 20u "Welcome to ${APP_NAME} Installer"
  Pop $0
  CreateFont $R0 "Arial" 14 700
  SendMessage $0 ${WM_SETFONT} $R0 0
  
  ; Welcome Message
  ${NSD_CreateLabel} 0 30u 100% 40u "This installer will guide you through the installation of ${APP_NAME} by ${APP_PUBLISHER}.$\r$\n$\r$\nBefore proceeding, the installer will verify that your system meets the minimum requirements for this application."
  Pop $1
  
  ; Requirements Box
  ${NSD_CreateGroupBox} 0 80u 100% 85u "Minimum System Requirements"
  Pop $2
  
  ${NSD_CreateLabel} 10u 95u 90% 12u "• Windows 10 or later (Build ${MIN_OS_BUILD}+)"
  Pop $3
  ${NSD_CreateLabel} 10u 110u 90% 12u "• 64-bit (x64) processor architecture"
  Pop $4
  ${NSD_CreateLabel} 10u 125u 90% 12u "• ${MIN_RAM_GB} GB RAM or more"
  Pop $5
  ${NSD_CreateLabel} 10u 140u 90% 12u "• ${MIN_DISK_SPACE_GB} GB free disk space"
  Pop $6
  ${NSD_CreateLabel} 10u 155u 90% 12u "• Administrator privileges"
  Pop $7
  
  ${NSD_CreateLabel} 0 175u 100% 16u "Click Next to begin the system requirements check."
  Pop $8
  
  nsDialogs::Show
FunctionEnd

Function CustomWelcomePageLeave
  ; Nothing special needed here
FunctionEnd

; ================================================================
; CUSTOM PAGES INSERTION
; ================================================================

; Insert custom welcome page
!macro customWelcomePage
  Page custom CustomWelcomePageCreate CustomWelcomePageLeave
!macroend

; Insert custom requirements validation page (after welcome, before directory selection)
!macro customInstallPage
  Page custom RequirementsPageCreate RequirementsPageLeave
!macroend

; ================================================================
; CUSTOM INITIALIZATION
; ================================================================

; Hook into electron-builder's installer initialization
!macro customInit
  ; Initialize validation variables
  StrCpy $VALIDATION_PASSED "0"
  StrCpy $VALIDATION_MESSAGE ""
  
  ; Log startup
  DetailPrint "========================================="
  DetailPrint "${APP_NAME} Installer by ${APP_PUBLISHER}"
  DetailPrint "Custom Installer with Requirements Check"
  DetailPrint "========================================="
!macroend

; ================================================================
; CUSTOM FINISH PAGE
; ================================================================

!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "${APP_NAME} Installation Complete"
  !define MUI_FINISHPAGE_TITLE_3LINES
  !define MUI_FINISHPAGE_TEXT "${APP_NAME} has been successfully installed on your computer.$\r$\n$\r$\nAll system requirements were verified and met.$\r$\n$\r$\nClick Finish to close this installer."
  !define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_NAME}.exe"
  !define MUI_FINISHPAGE_RUN_TEXT "Launch ${APP_NAME}"
  !define MUI_FINISHPAGE_LINK "Visit ${APP_PUBLISHER} Website"
  !define MUI_FINISHPAGE_LINK_LOCATION "https://www.presidio.com"
  !define MUI_FINISHPAGE_NOREBOOTSUPPORT
!macroend

; ================================================================
; CUSTOM UNINSTALLER
; ================================================================

Function un.onInit
  MessageBox MB_YESNO|MB_ICONQUESTION "Are you sure you want to uninstall ${APP_NAME}?" IDYES +2
  Abort
FunctionEnd

Function un.onUninstSuccess
  MessageBox MB_OK|MB_ICONINFORMATION "${APP_NAME} has been successfully removed from your computer."
FunctionEnd

; ================================================================
; MUI2 CUSTOM SETTINGS (for modern look)
; ================================================================

!macro customHeader
  !define MUI_ABORTWARNING
  !define MUI_ABORTWARNING_TEXT "Are you sure you want to quit ${APP_NAME} Setup?"
  !define MUI_ABORTWARNING_CANCEL_DEFAULT
  
  !define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install-colorful.ico"
  !define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall-colorful.ico"
  
  !define MUI_HEADERIMAGE
  !define MUI_HEADERIMAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Header\win.bmp"
  !define MUI_HEADERIMAGE_UNBITMAP "${NSISDIR}\Contrib\Graphics\Header\win.bmp"
  !define MUI_HEADERIMAGE_RIGHT
  
  !define MUI_WELCOMEFINISHPAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Wizard\win.bmp"
  !define MUI_UNWELCOMEFINISHPAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Wizard\win.bmp"
  
  !define MUI_COMPONENTSPAGE_SMALLDESC
  !define MUI_FINISHPAGE_NOAUTOCLOSE
  !define MUI_UNFINISHPAGE_NOAUTOCLOSE
  
  BrandingText "${APP_PUBLISHER} - ${APP_NAME} Setup"
  
  ; Custom colors (optional - can be customized)
  ; !define MUI_BGCOLOR FFFFFF
  ; !define MUI_TEXTCOLOR 000000
!macroend
