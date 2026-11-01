; Compiled only by build_windows.py from a verified staging directory.
#ifndef StageDir
  #error StageDir is required
#endif
#ifndef OutputDir
  #error OutputDir is required
#endif
#ifndef AppVersion
  #error AppVersion is required
#endif

[Setup]
AppId={{8D2E5C71-E796-4CAA-A323-BC886D2EB310}
AppName=Trama
AppVersion={#AppVersion}
AppPublisher=Trama
AppPublisherURL=https://github.com/Mentalidade-Hacker/trama
DefaultDirName={localappdata}\Trama
DefaultGroupName=Trama
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
MinVersion=10.0
OutputDir={#OutputDir}
OutputBaseFilename=trama-v{#AppVersion}-windows-setup
Compression=lzma2/normal
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\Trama.exe
CloseApplications=no
RestartApplications=no
SetupMutex=Local\Trama.Setup.Running

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na área de trabalho"; Flags: unchecked
Name: "setuptools"; Description: "Criar atalhos para configurar gramática e tradução"; Flags: unchecked

[Files]
Source: "{#StageDir}\Trama.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\runtime-source.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\runtime\*"; DestDir: "{app}\runtime"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\Trama.exe"; DestName: "TramaInstallCheck.exe"; Flags: dontcopy
Source: "{#StageDir}\install-files.txt"; Flags: dontcopy

[Icons]
Name: "{group}\Trama"; Filename: "{app}\Trama.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Trama"; Filename: "{app}\Trama.exe"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{group}\Configurar gramática"; Filename: "{app}\Trama.exe"; Parameters: "--setup-writing"; WorkingDir: "{app}"; Tasks: setuptools
Name: "{group}\Configurar tradução"; Filename: "{app}\Trama.exe"; Parameters: "--setup-translation"; WorkingDir: "{app}"; Tasks: setuptools

[Run]
Filename: "{app}\Trama.exe"; Description: "Abrir o Trama"; Flags: nowait postinstall skipifsilent

; No InstallDelete/UninstallDelete: data/, .app-updates/ and every file that
; was not installed by this package must survive installation and removal.
[Code]
const
  InstallingName = 'Local\Trama.Program.Installing';
  ReparseAttribute = $400;
var
  InstallingHandle: THandle;
  LegacyLockHandle: THandle;
  Inventory: TStringList;

function NativeCreateMutex(Attributes: LongWord; InitialOwner: Boolean; Name: String): THandle;
  external 'CreateMutexW@kernel32.dll stdcall';
function NativeCloseHandle(Handle: THandle): Boolean;
  external 'CloseHandle@kernel32.dll stdcall';
function NativeLastError: LongWord;
  external 'GetLastError@kernel32.dll stdcall';
function NativeCreateFile(Name: String; Access, Share: LongWord; Security: LongWord;
  Creation, Flags: LongWord; Template: THandle): THandle;
  external 'CreateFileW@kernel32.dll stdcall';
function NativeAttributes(Name: String): LongWord;
  external 'GetFileAttributesW@kernel32.dll stdcall';

procedure ReleaseGuards;
begin
  if (LegacyLockHandle <> 0) and (LegacyLockHandle <> THandle(-1)) then
    NativeCloseHandle(LegacyLockHandle);
  LegacyLockHandle := 0;
  if InstallingHandle <> 0 then NativeCloseHandle(InstallingHandle);
  InstallingHandle := 0;
end;

function HasLinkedAncestor(Path: String): Boolean;
var Previous: String; Attributes: LongWord;
begin
  Result := False;
  while Path <> '' do begin
    Attributes := NativeAttributes(Path);
    if (Attributes <> $FFFFFFFF) and ((Attributes and ReparseAttribute) <> 0) then begin
      Result := True; exit;
    end;
    Previous := Path;
    Path := ExtractFileDir(Path);
    if Path = Previous then exit;
  end;
end;

function ScanDestination(Root, Relative: String): String;
var Found: TFindRec; Name, Key, FullName: String; IsDirectory: Boolean; Index: Integer;
begin
  Result := '';
  if not FindFirst(AddBackslash(Root + Relative) + '*', Found) then exit;
  try
    repeat
      if (Found.Name <> '.') and (Found.Name <> '..') then begin
        Name := Relative + Found.Name;
        FullName := Root + Name;
        IsDirectory := (Found.Attributes and FILE_ATTRIBUTE_DIRECTORY) <> 0;
        if (Found.Attributes and ReparseAttribute) <> 0 then begin
          Result := 'A pasta contém um link de arquivo ou pasta: ' + Name; exit;
        end;
        { These folders are intentionally outside the installed program. }
        if (Relative = '') and IsDirectory and
          ((CompareText(Name, 'data') = 0) or (CompareText(Name, '.app-updates') = 0) or
           (CompareText(Name, 'logs') = 0)) then
          continue;
        if (Relative = '') and not IsDirectory and
          WildcardMatch(Lowercase(Name), 'unins???.*') then continue;
        Key := Lowercase(Name);
        StringChangeEx(Key, '\', '/', True);
        if IsDirectory then Key := Key + '/';
        { Python caches from the previous manual installer are left intact. }
        if IsDirectory and (CompareText(Found.Name, '__pycache__') = 0) then continue;
        if not Inventory.Find(Key, Index) then begin
          Result := 'Há arquivos pessoais ou desconhecidos na pasta do programa: ' + Name + #13#10 +
            'Escolha uma pasta nova ou mova esses arquivos para um local seguro antes de continuar. Suas notas não foram alteradas.';
          exit;
        end;
        if IsDirectory then begin
          Result := ScanDestination(Root, Name + '\');
          if Result <> '' then exit;
        end;
      end;
    until not FindNext(Found);
  finally
    FindClose(Found);
  end;
end;

function AcquireGuards(Checker: String): String;
var ExitCode: Integer; LockName: String; MutexError: LongWord;
begin
  Result := '';
  ReleaseGuards;
  InstallingHandle := NativeCreateMutex(0, False, InstallingName);
  MutexError := NativeLastError;
  if InstallingHandle = 0 then begin
    Result := 'Não foi possível proteger a instalação. Tente novamente.'; exit;
  end;
  if MutexError = 183 then begin
    Result := 'Já existe uma instalação ou remoção do Trama em andamento. Aguarde sua conclusão.';
    ReleaseGuards; exit;
  end;
  if not Exec(Checker, '--check-install "' + ExpandConstant('{app}') + '"', '',
      SW_HIDE, ewWaitUntilTerminated, ExitCode) then begin
    Result := 'Não foi possível verificar se o Trama está fechado. Nenhum arquivo foi substituído.';
  end else if ExitCode <> 0 then
    Result := 'Encerre o Trama por Salvar e encerrar e feche os assistentes de gramática/tradução antes de continuar. Fechar apenas a aba não encerra o aplicativo.';
  if Result = '' then begin
    LockName := ExpandConstant('{app}\.app-updates\running.lock');
    if FileExists(LockName) then begin
      { Hold the existing legacy lock file exclusively across the copy. }
      LegacyLockHandle := NativeCreateFile(LockName, $80000000, 0, 0, 3, $80, 0);
      if LegacyLockHandle = THandle(-1) then
        Result := 'O Trama ainda está aberto ou sua trava não pode ser verificada. Encerre o aplicativo e tente novamente.';
    end;
  end;
  if Result <> '' then ReleaseGuards;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  ReleaseGuards;
  if HasLinkedAncestor(ExpandConstant('{app}')) then begin
    Result := 'Escolha uma pasta de instalação que não contenha links ou junções.'; exit;
  end;
  ExtractTemporaryFile('install-files.txt');
  if Inventory = nil then Inventory := TStringList.Create;
  Inventory.LoadFromFile(ExpandConstant('{tmp}\install-files.txt'));
  Inventory.CaseSensitive := False;
  Inventory.Sorted := True;
  Result := ScanDestination(AddBackslash(ExpandConstant('{app}')), '');
  if Result <> '' then exit;
  ExtractTemporaryFile('TramaInstallCheck.exe');
  Result := AcquireGuards(ExpandConstant('{tmp}\TramaInstallCheck.exe'));
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then ReleaseGuards;
end;

procedure DeinitializeSetup;
begin
  ReleaseGuards;
  if Inventory <> nil then Inventory.Free;
end;

function InitializeUninstall: Boolean;
var Problem: String;
begin
  Problem := AcquireGuards(ExpandConstant('{app}\Trama.exe'));
  Result := Problem = '';
  if not Result then MsgBox(Problem, mbError, MB_OK);
end;

procedure DeinitializeUninstall;
begin
  ReleaseGuards;
end;
