; VideoCaptionsAI Installer Script v3
#define MyAppName "VideoCaptionsAI"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "VideoCaptionsAI"
#define MyAppExeName "VideoCaptionsAI.exe"
#define MySourcePath "E:\VideoCaptionsAI\VideoSubs\dist\VideoCaptionsAI"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=E:\VideoCaptionsAI\installer
OutputBaseFilename=VideoCaptionsAI_Setup_1.0
Compression=lzma2
SolidCompression=no
WizardStyle=modern
DisableDirPage=no
DirExistsWarning=yes
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
Source: "{#MySourcePath}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch VideoCaptionsAI"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill"; Parameters: "/f /im VideoCaptionsAI.exe"; Flags: runhidden


