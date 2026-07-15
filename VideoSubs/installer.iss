; Inno Setup Script for VideoCaptionsAI
; Generates a single EXE installer (supports install directory selection, desktop/start menu shortcuts)

[Setup]
AppName=VideoCaptionsAI
AppVersion=1.0.0
AppPublisher=VideoCaptionsAI
DefaultDirName={autopf}\VideoCaptionsAI
DefaultGroupName=VideoCaptionsAI
OutputDir=.\
OutputBaseFilename=VideoCaptionsAI_Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName=VideoCaptionsAI
PrivilegesRequired=lowest
DisableProgramGroupPage=no
AllowNoIcons=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
Source: "dist\VideoCaptionsAI\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\VideoCaptionsAI"; Filename: "{app}\VideoCaptionsAI.exe"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,VideoCaptionsAI}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\VideoCaptionsAI"; Filename: "{app}\VideoCaptionsAI.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\VideoCaptionsAI.exe"; Description: "{cm:LaunchProgram,VideoCaptionsAI}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\outputs"
Type: filesandordirs; Name: "{app}\asr_cache"