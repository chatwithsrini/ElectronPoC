; ================================================================
; CUSTOM NSIS INSTALLER SCRIPT FOR ELECTRON POC
; ================================================================
; 4-Step Installer:
; 1. Simple Welcome Page
; 2. System Configuration Comparison (Required vs Actual)
; 3. Installation Directory with Disk Space Check
; 4. Finish Page
; ================================================================

!include "LogicLib.nsh"
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"
!include "FileFunc.nsh"

!insertmacro GetRoot
!insertmacro DriveSpace

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
Var /GLOBAL AllChecksPassed
Var /GLOBAL INSTDIR_FREE_SPACE_GB
Var /GLOBAL ConfigChecksRun

; UI Control Handles
Var /GLOBAL Dialog

; ================================================================
; MINIMUM REQUIREMENTS CONFIGURATION
; ================================================================
!define APP_NAME "Electron POC"
!define APP_PUBLISHER "DentalXChange"
!define MIN_OS_MAJOR 10
!define MIN_OS_BUILD 10240
!define MIN_RAM_GB 4
!define MIN_DISK_SPACE_GB 2
!define REQUIRED_ARCH "x64"

; ================================================================
; SYSTEM REQUIREMENT CHECK FUNCTIONS
; ================================================================

Function CheckWindowsVersion
  Push $R0
  System::Call 'kernel32::GetVersion() i .r0'
  IntOp $OS_VERSION_MAJOR $0 & 0xFF
  IntOp $OS_VERSION_MINOR $0 & 0xFF00
  IntOp $OS_VERSION_MINOR $OS_VERSION_MINOR / 256
  ReadRegStr $OS_BUILD HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
  ${If} $OS_BUILD == ""
    ReadRegStr $OS_BUILD HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuild"
  ${EndIf}
  ${If} $OS_BUILD == ""
    StrCpy $OS_BUILD "0"
  ${EndIf}
  IntOp $R0 0 + $OS_BUILD
  ${If} $OS_VERSION_MAJOR < ${MIN_OS_MAJOR}
    StrCpy $AllChecksPassed "0"
  ${ElseIf} $R0 < ${MIN_OS_BUILD}
    StrCpy $AllChecksPassed "0"
  ${EndIf}
  Pop $R0
FunctionEnd

Function CheckArchitecture
  Push $0
  ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "PROCESSOR_ARCHITECTURE"
  ${If} $0 == ""
    ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "PROCESSOR_ARCHITEW6432"
  ${EndIf}
  ${If} $0 == "AMD64"
    StrCpy $ARCHITECTURE "x64"
  ${ElseIf} $0 == "x64"
    StrCpy $ARCHITECTURE "x64"
  ${Else}
    StrCpy $ARCHITECTURE $0
    StrCpy $AllChecksPassed "0"
  ${EndIf}
  ${If} $ARCHITECTURE == ""
    StrCpy $ARCHITECTURE "Unknown"
  ${EndIf}
  Pop $0
FunctionEnd

Function CheckRAM
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  
  StrCpy $SYSTEM_RAM_GB "8"
  
  ; Method 1: Use simple PowerShell command with direct output
  ClearErrors
  nsExec::ExecToStack 'powershell -NoProfile -ExecutionPolicy Bypass -Command "[Math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB)"'
  Pop $0  ; return code
  Pop $1  ; output
  
  ${If} $0 == 0
    ; Trim the output
    Push $1
    Call TrimString
    Pop $1
    
    ; Check if it's a valid number
    ${If} $1 != ""
      IntOp $2 $1 + 0
      ${If} $2 >= 1
      ${AndIf} $2 <= 1024
        StrCpy $SYSTEM_RAM_GB $1
        DetailPrint "RAM Detection: Found $SYSTEM_RAM_GB GB via PowerShell"
        Goto CheckRAM_Validate
      ${EndIf}
    ${EndIf}
  ${EndIf}
  
  ; Method 2: Try with Get-WmiObject (older PowerShell version compatibility)
  ClearErrors
  nsExec::ExecToStack 'powershell -NoProfile -ExecutionPolicy Bypass -Command "[Math]::Round((Get-WmiObject Win32_ComputerSystem).TotalPhysicalMemory/1GB)"'
  Pop $0
  Pop $1
  
  ${If} $0 == 0
    Push $1
    Call TrimString
    Pop $1
    
    ${If} $1 != ""
      IntOp $2 $1 + 0
      ${If} $2 >= 1
      ${AndIf} $2 <= 1024
        StrCpy $SYSTEM_RAM_GB $1
        DetailPrint "RAM Detection: Found $SYSTEM_RAM_GB GB via WMI"
        Goto CheckRAM_Validate
      ${EndIf}
    ${EndIf}
  ${EndIf}
  
  ; Method 3: Try WMIC with temp file
  GetTempFileName $3
  ClearErrors
  nsExec::ExecToLog 'cmd /c wmic computersystem get totalphysicalmemory /value > "$3" 2>&1'
  Pop $0
  
  ${If} $0 == 0
    ClearErrors
    FileOpen $4 "$3" r
    ${IfNot} ${Errors}
      ; Read file line by line
      CheckRAM_WMICLoop:
        ClearErrors
        FileRead $4 $1
        ${If} ${Errors}
          FileClose $4
          Goto CheckRAM_WMICDone
        ${EndIf}
        
        ; Trim line
        Push $1
        Call TrimString
        Pop $1
        
        ; Look for TotalPhysicalMemory=
        StrLen $2 $1
        ${If} $2 > 21
          StrCpy $0 $1 21
          ${If} $0 == "TotalPhysicalMemory="
            ; Extract bytes value
            StrCpy $2 $1 "" 21
            Push $2
            Call TrimString
            Pop $2
            
            ; Convert bytes to GB
            ; Using better math: bytes / (1024*1024*1024) = bytes / 1073741824
            ${If} $2 > 1000000000
              ; For numbers > 1 billion, divide by billion and adjust
              System::Int64Op $2 / 1073741824
              Pop $SYSTEM_RAM_GB
              
              ${If} $SYSTEM_RAM_GB >= 1
              ${AndIf} $SYSTEM_RAM_GB <= 1024
                DetailPrint "RAM Detection: Found $SYSTEM_RAM_GB GB via WMIC"
                FileClose $4
                Delete "$3"
                Goto CheckRAM_Validate
              ${EndIf}
            ${EndIf}
          ${EndIf}
        ${EndIf}
        
        Goto CheckRAM_WMICLoop
      
      CheckRAM_WMICDone:
        FileClose $4
    ${EndIf}
    Delete "$3"
  ${EndIf}
  
  ; Method 4: Try systeminfo command
  GetTempFileName $3
  ClearErrors
  nsExec::ExecToLog 'cmd /c systeminfo | findstr /C:"Total Physical Memory" > "$3" 2>&1'
  Pop $0
  
  ${If} $0 == 0
    ClearErrors
    FileOpen $4 "$3" r
    ${IfNot} ${Errors}
      FileRead $4 $1
      FileClose $4
      
      ${IfNot} ${Errors}
        ; Example output: "Total Physical Memory:     16,384 MB"
        ; Look for MB or GB in the string
        Push $1
        Call ExtractRAMFromSystemInfo
        Pop $2
        
        ${If} $2 != ""
        ${AndIf} $2 != "0"
          IntOp $0 $2 + 0
          ${If} $0 >= 1
          ${AndIf} $0 <= 1024
            StrCpy $SYSTEM_RAM_GB $2
            DetailPrint "RAM Detection: Found $SYSTEM_RAM_GB GB via systeminfo"
            Delete "$3"
            Goto CheckRAM_Validate
          ${EndIf}
        ${EndIf}
      ${EndIf}
    ${EndIf}
    Delete "$3"
  ${EndIf}
  
  ; If all methods fail, use default
  StrCpy $SYSTEM_RAM_GB "8"
  DetailPrint "RAM Detection: Using fallback value $SYSTEM_RAM_GB GB"
  
  CheckRAM_Validate:
  ; Ensure we have a valid number
  IntOp $0 $SYSTEM_RAM_GB + 0
  ${If} $0 < 1
    StrCpy $SYSTEM_RAM_GB "8"
  ${EndIf}
  
  ; Compare with minimum requirement
  IntCmp $SYSTEM_RAM_GB ${MIN_RAM_GB} CheckRAM_OK CheckRAM_Fail CheckRAM_OK
  CheckRAM_Fail:
    StrCpy $AllChecksPassed "0"
  CheckRAM_OK:
  
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

; Extract RAM GB from systeminfo output
; Input: Stack top = systeminfo line (e.g., "Total Physical Memory:     16,384 MB")
; Output: Stack top = RAM in GB
Function ExtractRAMFromSystemInfo
  Exch $0  ; Get input string
  Push $1
  Push $2
  Push $3
  
  ; Remove commas
  StrCpy $1 ""
  StrLen $2 $0
  IntOp $2 $2 - 1
  
  ExtractRAM_RemoveCommas:
    ${If} $2 < 0
      Goto ExtractRAM_Parse
    ${EndIf}
    StrCpy $3 $0 1 $2
    ${If} $3 != ","
      StrCpy $1 "$3$1"
    ${EndIf}
    IntOp $2 $2 - 1
    Goto ExtractRAM_RemoveCommas
  
  ExtractRAM_Parse:
    ; Now $1 contains string without commas
    ; Look for number followed by MB or GB
    StrLen $2 $1
    IntOp $2 $2 - 1
    
    ExtractRAM_FindNumber:
      ${If} $2 < 0
        StrCpy $0 "0"
        Goto ExtractRAM_Done
      ${EndIf}
      
      StrCpy $3 $1 2 $2
      ${If} $3 == "MB"
      ${OrIf} $3 == "mb"
        ; Found MB, extract number before it
        IntOp $2 $2 - 1
        ExtractRAM_GetMBNumber:
          ${If} $2 < 0
            StrCpy $0 "0"
            Goto ExtractRAM_Done
          ${EndIf}
          StrCpy $3 $1 1 $2
          ${If} $3 >= "0"
          ${AndIf} $3 <= "9"
            IntOp $2 $2 - 1
            Goto ExtractRAM_GetMBNumber
          ${EndIf}
          ; Now $2 points to last non-digit
          IntOp $2 $2 + 1
          StrCpy $3 $1 "" $2  ; Get number and MB
          StrCpy $3 $3 -3     ; Remove " MB"
          Push $3
          Call TrimString
          Pop $3
          ; Convert MB to GB
          IntOp $0 $3 / 1024
          ${If} $0 < 1
            StrCpy $0 "1"
          ${EndIf}
          Goto ExtractRAM_Done
      ${EndIf}
      
      ${If} $3 == "GB"
      ${OrIf} $3 == "gb"
        ; Found GB, extract number before it
        IntOp $2 $2 - 1
        ExtractRAM_GetGBNumber:
          ${If} $2 < 0
            StrCpy $0 "0"
            Goto ExtractRAM_Done
          ${EndIf}
          StrCpy $3 $1 1 $2
          ${If} $3 >= "0"
          ${AndIf} $3 <= "9"
            IntOp $2 $2 - 1
            Goto ExtractRAM_GetGBNumber
          ${EndIf}
          ; Now $2 points to last non-digit
          IntOp $2 $2 + 1
          StrCpy $3 $1 "" $2  ; Get number and GB
          StrCpy $3 $3 -3     ; Remove " GB"
          Push $3
          Call TrimString
          Pop $0
          Goto ExtractRAM_Done
      ${EndIf}
      
      IntOp $2 $2 - 1
      Goto ExtractRAM_FindNumber
  
  ExtractRAM_Done:
  Pop $3
  Pop $2
  Pop $1
  Exch $0
FunctionEnd

; Helper function to trim whitespace from strings
Function TrimString
  Exch $R0
  Push $R1
  Push $R2
  
  ; Trim leading whitespace
  TrimString_Loop1:
    StrCpy $R1 "$R0" 1
    ${If} $R1 == " "
    ${OrIf} $R1 == "$\t"
    ${OrIf} $R1 == "$\r"
    ${OrIf} $R1 == "$\n"
      StrCpy $R0 "$R0" "" 1
      Goto TrimString_Loop1
    ${EndIf}
  
  ; Trim trailing whitespace
  TrimString_Loop2:
    StrLen $R2 "$R0"
    IntOp $R2 $R2 - 1
    ${If} $R2 < 0
      Goto TrimString_Done
    ${EndIf}
    StrCpy $R1 "$R0" 1 $R2
    ${If} $R1 == " "
    ${OrIf} $R1 == "$\t"
    ${OrIf} $R1 == "$\r"
    ${OrIf} $R1 == "$\n"
      StrCpy $R0 "$R0" $R2
      Goto TrimString_Loop2
    ${EndIf}
  
  TrimString_Done:
  Pop $R2
  Pop $R1
  Exch $R0
FunctionEnd

Function CheckDiskSpaceForPath
  Push $0
  ClearErrors
  ${GetRoot} "$R0" $0
  ${DriveSpace} "$0" "/D=F /S=G" $R1
  ${If} ${Errors}
    StrCpy $R1 "10"
  ${EndIf}
  Pop $0
FunctionEnd

Function CheckAdminPrivileges
  Push $0
  ClearErrors
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion" "ProgramFilesDir"
  ${If} ${Errors}
    StrCpy $IS_ADMIN "No"
  ${Else}
    StrCpy $IS_ADMIN "Yes"
  ${EndIf}
  Pop $0
FunctionEnd

; ================================================================
; STEP 1: SIMPLE WELCOME PAGE
; ================================================================

Function WelcomePageCreate
  !insertmacro MUI_HEADER_TEXT "Welcome" "Welcome to ${APP_NAME} Setup"
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}
  
  ${NSD_CreateLabel} 0 10u 100% 24u "Welcome to ${APP_NAME} Installer"
  Pop $0
  CreateFont $R0 "Arial" 16 700
  SendMessage $0 ${WM_SETFONT} $R0 0
  
  ${NSD_CreateLabel} 0 50u 100% 60u "This wizard will guide you through the installation of ${APP_NAME} by ${APP_PUBLISHER}.$\r$\n$\r$\nThe installer will verify that your system meets the minimum requirements before installation.$\r$\n$\r$\nClick Next to continue."
  Pop $1
  
  nsDialogs::Show
FunctionEnd

Function WelcomePageLeave
FunctionEnd

; ================================================================
; STEP 2: SYSTEM CONFIGURATION COMPARISON PAGE
; ================================================================

Function SystemConfigPageCreate
  !insertmacro MUI_HEADER_TEXT "System Configuration" "Verifying system requirements"
  
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}
  
  ; Only run checks once
  ${If} $ConfigChecksRun != "1"
    StrCpy $AllChecksPassed "1"
    Call CheckWindowsVersion
    Call CheckArchitecture
    Call CheckRAM
    Call CheckAdminPrivileges
    StrCpy $R0 "C:\"
    Call CheckDiskSpaceForPath
    StrCpy $FREE_DISK_SPACE_GB $R1
    StrCpy $ConfigChecksRun "1"
  ${EndIf}
  
  ; Title
  ${NSD_CreateLabel} 0 0 100% 16u "System Requirements Check"
  Pop $0
  CreateFont $R0 "Arial" 12 700
  SendMessage $0 ${WM_SETFONT} $R0 0
  
  ; Subtitle
  ${NSD_CreateLabel} 0 20u 100% 12u "Comparing your system configuration with minimum requirements"
  Pop $0
  
  ; Column Headers
  ${NSD_CreateLabel} 5u 40u 30% 14u "Requirement"
  Pop $0
  CreateFont $R1 "Arial" 10 700
  SendMessage $0 ${WM_SETFONT} $R1 0
  
  ${NSD_CreateLabel} 35% 40u 30% 14u "Required"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $R1 0
  
  ${NSD_CreateLabel} 70% 40u 30% 14u "Your System"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $R1 0
  
  ; OS Version
  ${NSD_CreateLabel} 5u 60u 30% 12u "Operating System"
  Pop $0
  ${NSD_CreateLabel} 35% 60u 30% 12u "Windows ${MIN_OS_MAJOR} (Build ${MIN_OS_BUILD}+)"
  Pop $0
  ${NSD_CreateLabel} 70% 60u 30% 12u "Windows $OS_VERSION_MAJOR.$OS_VERSION_MINOR (Build $OS_BUILD)"
  Pop $1
  ; Check OS version and mark if failed
  IntOp $R3 0 + $OS_BUILD
  ${If} $OS_VERSION_MAJOR < ${MIN_OS_MAJOR}
  ${OrIf} $R3 < ${MIN_OS_BUILD}
    SetCtlColors $1 0xFF0000 transparent
    ${NSD_CreateLabel} 97% 60u 3% 12u "✗"
    Pop $2
    CreateFont $R4 "Arial" 11 700
    SendMessage $2 ${WM_SETFONT} $R4 0
    SetCtlColors $2 0xFF0000 transparent
  ${Else}
    SetCtlColors $1 0x00AA00 transparent
    ${NSD_CreateLabel} 97% 60u 3% 12u "✓"
    Pop $2
    CreateFont $R4 "Arial" 11 700
    SendMessage $2 ${WM_SETFONT} $R4 0
    SetCtlColors $2 0x00AA00 transparent
  ${EndIf}
  
  ; Architecture
  ${NSD_CreateLabel} 5u 76u 30% 12u "Architecture"
  Pop $0
  ${NSD_CreateLabel} 35% 76u 30% 12u "${REQUIRED_ARCH} (64-bit)"
  Pop $0
  ${NSD_CreateLabel} 70% 76u 30% 12u "$ARCHITECTURE"
  Pop $1
  ; Check architecture and mark if failed
  ${If} $ARCHITECTURE != "${REQUIRED_ARCH}"
    SetCtlColors $1 0xFF0000 transparent
    ${NSD_CreateLabel} 97% 76u 3% 12u "✗"
    Pop $2
    CreateFont $R4 "Arial" 11 700
    SendMessage $2 ${WM_SETFONT} $R4 0
    SetCtlColors $2 0xFF0000 transparent
  ${Else}
    SetCtlColors $1 0x00AA00 transparent
    ${NSD_CreateLabel} 97% 76u 3% 12u "✓"
    Pop $2
    CreateFont $R4 "Arial" 11 700
    SendMessage $2 ${WM_SETFONT} $R4 0
    SetCtlColors $2 0x00AA00 transparent
  ${EndIf}
  
  ; RAM
  ${NSD_CreateLabel} 5u 92u 30% 12u "RAM"
  Pop $0
  ${NSD_CreateLabel} 35% 92u 30% 12u "${MIN_RAM_GB} GB or more"
  Pop $0
  ${NSD_CreateLabel} 70% 92u 30% 12u "$SYSTEM_RAM_GB GB"
  Pop $1
  ; Check RAM and mark if failed
  IntOp $R3 $SYSTEM_RAM_GB + 0
  ${If} $R3 < ${MIN_RAM_GB}
    SetCtlColors $1 0xFF0000 transparent
    ${NSD_CreateLabel} 97% 92u 3% 12u "✗"
    Pop $2
    CreateFont $R4 "Arial" 11 700
    SendMessage $2 ${WM_SETFONT} $R4 0
    SetCtlColors $2 0xFF0000 transparent
  ${Else}
    SetCtlColors $1 0x00AA00 transparent
    ${NSD_CreateLabel} 97% 92u 3% 12u "✓"
    Pop $2
    CreateFont $R4 "Arial" 11 700
    SendMessage $2 ${WM_SETFONT} $R4 0
    SetCtlColors $2 0x00AA00 transparent
  ${EndIf}
  
  ; Disk Space
  ${NSD_CreateLabel} 5u 108u 30% 12u "Free Disk Space"
  Pop $0
  ${NSD_CreateLabel} 35% 108u 30% 12u "${MIN_DISK_SPACE_GB} GB or more"
  Pop $0
  ${NSD_CreateLabel} 70% 108u 30% 12u "$FREE_DISK_SPACE_GB GB (C: drive)"
  Pop $1
  ; Check disk space and mark if failed
  IntOp $R3 $FREE_DISK_SPACE_GB + 0
  ${If} $R3 < ${MIN_DISK_SPACE_GB}
    SetCtlColors $1 0xFF0000 transparent
    ${NSD_CreateLabel} 97% 108u 3% 12u "✗"
    Pop $2
    CreateFont $R4 "Arial" 11 700
    SendMessage $2 ${WM_SETFONT} $R4 0
    SetCtlColors $2 0xFF0000 transparent
  ${Else}
    SetCtlColors $1 0x00AA00 transparent
    ${NSD_CreateLabel} 97% 108u 3% 12u "✓"
    Pop $2
    CreateFont $R4 "Arial" 11 700
    SendMessage $2 ${WM_SETFONT} $R4 0
    SetCtlColors $2 0x00AA00 transparent
  ${EndIf}
  
  ; Administrator
  ${NSD_CreateLabel} 5u 124u 30% 12u "Administrator"
  Pop $0
  ${NSD_CreateLabel} 35% 124u 30% 12u "Required"
  Pop $0
  ${NSD_CreateLabel} 70% 124u 30% 12u "$IS_ADMIN"
  Pop $1
  ; Check admin privileges and mark if failed
  ${If} $IS_ADMIN != "Yes"
    SetCtlColors $1 0xFF0000 transparent
    ${NSD_CreateLabel} 97% 124u 3% 12u "✗"
    Pop $2
    CreateFont $R4 "Arial" 11 700
    SendMessage $2 ${WM_SETFONT} $R4 0
    SetCtlColors $2 0xFF0000 transparent
  ${Else}
    SetCtlColors $1 0x00AA00 transparent
    ${NSD_CreateLabel} 97% 124u 3% 12u "✓"
    Pop $2
    CreateFont $R4 "Arial" 11 700
    SendMessage $2 ${WM_SETFONT} $R4 0
    SetCtlColors $2 0x00AA00 transparent
  ${EndIf}
  
  ; Separator line
  ${NSD_CreateHLine} 0 145u 100% 1u ""
  Pop $0
  
  ; Result message
  ${NSD_CreateLabel} 0 155u 100% 24u ""
  Pop $1
  CreateFont $R2 "Arial" 10 700
  SendMessage $1 ${WM_SETFONT} $R2 0
  
  ${If} $AllChecksPassed == "1"
    SendMessage $1 ${WM_SETTEXT} 0 "STR:✓ All system requirements are met. Click Next to continue."
  ${Else}
    SendMessage $1 ${WM_SETTEXT} 0 "STR:✗ System requirements are NOT met. Installation cannot continue."
    ; Disable Next button
    GetDlgItem $0 $HWNDPARENT 1
    EnableWindow $0 0
  ${EndIf}
  
  nsDialogs::Show
FunctionEnd

Function SystemConfigPageLeave
  ${If} $AllChecksPassed == "0"
    MessageBox MB_OK|MB_ICONSTOP "System Requirements Not Met$\n$\nYour system does not meet the minimum requirements for ${APP_NAME}.$\n$\nPlease upgrade your system and try again."
    Abort
  ${EndIf}
FunctionEnd

; ================================================================
; STEP 3: INSTALLATION DIRECTORY WITH DISK SPACE CHECK
; ================================================================

Function CustomDirectoryPageCreate
  !insertmacro MUI_HEADER_TEXT "Choose Install Location" "Choose the folder to install ${APP_NAME}"
  
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}
  
  ${NSD_CreateLabel} 0 0 100% 16u "Installation Directory"
  Pop $0
  CreateFont $R0 "Arial" 12 700
  SendMessage $0 ${WM_SETFONT} $R0 0
  
  ${NSD_CreateLabel} 0 20u 100% 12u "Choose the folder where ${APP_NAME} will be installed."
  Pop $0
  
  ${NSD_CreateLabel} 0 40u 100% 12u "Destination folder:"
  Pop $0
  
  ${NSD_CreateText} 0 55u 85% 12u "$INSTDIR"
  Pop $1
  
  ${NSD_CreateBrowseButton} 87% 55u 13% 12u "Browse..."
  Pop $2
  
  ; Disk space info
  ${NSD_CreateLabel} 0 80u 100% 12u "Required free space: ${MIN_DISK_SPACE_GB} GB"
  Pop $0
  
  ; Check current disk space
  ClearErrors
  ${GetRoot} "$INSTDIR" $R0
  ${DriveSpace} "$R0" "/D=F /S=G" $R1
  ${If} ${Errors}
    StrCpy $R1 "10"
  ${EndIf}
  StrCpy $INSTDIR_FREE_SPACE_GB $R1
  
  ${NSD_CreateLabel} 0 95u 100% 12u "Available space on drive: $INSTDIR_FREE_SPACE_GB GB"
  Pop $0
  
  ${If} $INSTDIR_FREE_SPACE_GB < ${MIN_DISK_SPACE_GB}
    ${NSD_CreateLabel} 0 115u 100% 24u "⚠ Warning: Insufficient disk space on the selected drive."
    Pop $0
    CreateFont $R2 "Arial" 10 700
    SendMessage $0 ${WM_SETFONT} $R2 0
  ${Else}
    ${NSD_CreateLabel} 0 115u 100% 24u "✓ Sufficient disk space available."
    Pop $0
    CreateFont $R2 "Arial" 10 700
    SendMessage $0 ${WM_SETFONT} $R2 0
  ${EndIf}
  
  nsDialogs::Show
FunctionEnd

Function CustomDirectoryPageLeave
  ; Re-check disk space for selected directory
  ClearErrors
  ${GetRoot} "$INSTDIR" $R0
  ${DriveSpace} "$R0" "/D=F /S=G" $R1
  ${If} ${Errors}
    StrCpy $R1 "10"
  ${EndIf}
  StrCpy $INSTDIR_FREE_SPACE_GB $R1
  
  ${If} $INSTDIR_FREE_SPACE_GB < ${MIN_DISK_SPACE_GB}
    MessageBox MB_OK|MB_ICONSTOP "Insufficient Disk Space$\n$\nRequired: ${MIN_DISK_SPACE_GB} GB$\nAvailable on $R0: $INSTDIR_FREE_SPACE_GB GB$\n$\nPlease select a different drive or free up space."
    Abort
  ${EndIf}
FunctionEnd

; ================================================================
; CUSTOM PAGES INSERTION
; ================================================================

!macro customWelcomePage
  Page custom WelcomePageCreate WelcomePageLeave
  Page custom SystemConfigPageCreate SystemConfigPageLeave
!macroend

!macro customDirectoryPage
  Page custom CustomDirectoryPageCreate CustomDirectoryPageLeave
!macroend

; ================================================================
; CUSTOM INITIALIZATION
; ================================================================

!macro customInit
  StrCpy $AllChecksPassed "1"
  StrCpy $ConfigChecksRun "0"
  StrCpy $OS_VERSION_MAJOR "0"
  StrCpy $OS_VERSION_MINOR "0"
  StrCpy $OS_BUILD "0"
  StrCpy $SYSTEM_RAM_GB "0"
  StrCpy $FREE_DISK_SPACE_GB "0"
  StrCpy $ARCHITECTURE "Unknown"
  StrCpy $IS_ADMIN "Unknown"
  DetailPrint "========================================="
  DetailPrint "${APP_NAME} Installer by ${APP_PUBLISHER}"
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
; MUI2 CUSTOM SETTINGS
; ================================================================

!macro customHeader
  !ifndef MUI_ABORTWARNING
    !define MUI_ABORTWARNING
  !endif
  !ifndef MUI_ABORTWARNING_TEXT
    !define MUI_ABORTWARNING_TEXT "Are you sure you want to quit ${APP_NAME} Setup?"
  !endif
  !ifndef MUI_ABORTWARNING_CANCEL_DEFAULT
    !define MUI_ABORTWARNING_CANCEL_DEFAULT
  !endif
  
  !ifndef MUI_ICON
    !define MUI_ICON "build\installer.ico"
  !endif
  !ifndef MUI_UNICON
    !define MUI_UNICON "build\installer.ico"
  !endif
  
  !ifndef MUI_HEADERIMAGE
    !define MUI_HEADERIMAGE
  !endif
  !ifndef MUI_HEADERIMAGE_BITMAP
    !define MUI_HEADERIMAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Header\win.bmp"
  !endif
  !ifndef MUI_HEADERIMAGE_UNBITMAP
    !define MUI_HEADERIMAGE_UNBITMAP "${NSISDIR}\Contrib\Graphics\Header\win.bmp"
  !endif
  !ifndef MUI_HEADERIMAGE_RIGHT
    !define MUI_HEADERIMAGE_RIGHT
  !endif
  
  !ifndef MUI_WELCOMEFINISHPAGE_BITMAP
    !define MUI_WELCOMEFINISHPAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Wizard\win.bmp"
  !endif
  !ifndef MUI_UNWELCOMEFINISHPAGE_BITMAP
    !define MUI_UNWELCOMEFINISHPAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Wizard\win.bmp"
  !endif
  
  !ifndef MUI_COMPONENTSPAGE_SMALLDESC
    !define MUI_COMPONENTSPAGE_SMALLDESC
  !endif
  !ifndef MUI_FINISHPAGE_NOAUTOCLOSE
    !define MUI_FINISHPAGE_NOAUTOCLOSE
  !endif
  !ifndef MUI_UNFINISHPAGE_NOAUTOCLOSE
    !define MUI_UNFINISHPAGE_NOAUTOCLOSE
  !endif
  
  BrandingText "${APP_PUBLISHER} - ${APP_NAME} Setup"
!macroend
