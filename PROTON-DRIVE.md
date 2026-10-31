# Trama em mais de um computador com Proton Drive

O Trama continua rodando localmente em cada computador. A pasta de troca guarda cópias completas de notas e anexos; o Proton Drive pode transportar esses arquivos entre suas máquinas. No Trama, você revisa uma cópia recebida antes de aplicá-la.

O mecanismo é de publicação e recebimento de versões. Não é edição colaborativa ao vivo, e não depende de deixar o banco SQLite aberto dentro de uma pasta de nuvem. Um link público do Proton Drive também não transforma o Trama em um aplicativo hospedado.

## Escolha como transportar os arquivos

| Situação | Transporte |
| --- | --- |
| Já tem uma pasta local sincronizada pelo aplicativo Proton Drive | Escolha uma subpasta dedicada como **Pasta de troca** no Trama. O cliente Proton transfere seus arquivos. |
| Arch Linux ou transferência manual no Windows | Use o helper fornecido com a CLI oficial do Proton Drive. |
| Quer apenas levar uma cópia uma vez | Exporte o cofre ZIP em **Dados e backups**, envie pelo site do Proton Drive e importe no outro computador. |

A [CLI oficial do Proton Drive](https://proton.me/support/drive-cli) tem versões para Linux, Windows e macOS. Ela executa transferências quando solicitada; não é, por si só, um cliente que mantém uma pasta sincronizada continuamente. Consulte a [descrição oficial do funcionamento](https://proton.me/business/drive/cli).

## Preparar cada computador

1. Instale e abra o Trama em cada máquina.
2. Crie uma pasta vazia e dedicada, por exemplo `Trama-Sync`, fora da pasta que contém `trama.db`.
3. Abra **Sincronização** no Trama e selecione essa pasta em **Pasta de troca**.
4. Confira o nome do computador exibido pelo Trama; ele usa automaticamente o nome do sistema para identificar as cópias.

O Trama publica pares de arquivos com nomes como `a1b2…<32 caracteres hexadecimais>.zip` e `.json`. O ZIP contém a cópia; o JSON identifica o dispositivo, sua origem e o checksum. Não renomeie, edite nem separe esses pares. Pastas internas de recebimento e pares incompletos são ignorados pela leitura normal da pasta de troca.

## Instalar a CLI oficial

Baixe o executável correspondente ao seu sistema na [página oficial de downloads da CLI](https://proton.me/download/drive/cli/index.html). Ela publica também os checksums SHA-512. Os helpers não baixam nem instalam o executável automaticamente.

No Linux, torne o binário executável e deixe-o no `PATH`. Exemplo, executado na pasta em que você o baixou:

```bash
chmod +x ./proton-drive
install -Dm755 ./proton-drive "$HOME/.local/bin/proton-drive"
```

No Windows, use `proton-drive.exe` no `PATH` ou informe seu caminho completo com `-Cli` no helper PowerShell. Também é possível usar `--cli` ao chamar o helper Python diretamente.

O login acontece no navegador. A CLI guarda a sessão no cofre de credenciais do sistema; no Linux, ela precisa de um serviço de segredos como GNOME Keyring ou KWallet com libsecret. O Trama não recebe sua senha, código de verificação ou sessão. Veja os [requisitos e a autenticação documentados pela Proton](https://github.com/ProtonDriveApps/sdk/blob/main/cli/README.md).

## Arch Linux: entrar e transferir

Na pasta do aplicativo Trama:

```bash
bash proton-transfer.sh login
```

Conclua o login na janela aberta pela Proton. Depois crie **uma única vez** uma pasta remota dedicada pelo site do Proton Drive ou com:

```bash
proton-drive filesystem create-folder /my-files Trama
```

Supondo que a **Pasta de troca** escolhida no Trama seja `$HOME/Trama-Sync`:

```bash
# Depois de usar “Publicar cópia” no Trama:
bash proton-transfer.sh upload "$HOME/Trama-Sync" /my-files/Trama

# Antes de receber notas produzidas em outro computador:
bash proton-transfer.sh download /my-files/Trama "$HOME/Trama-Sync"
```

Se o executável não estiver no `PATH`, acrescente `--cli /caminho/proton-drive` aos comandos do helper.

## Windows: entrar e transferir

Abra PowerShell na pasta extraída do Trama. Informe o caminho real do executável que baixou:

```powershell
$protonCli = Join-Path $env:USERPROFILE 'Downloads\proton-drive.exe'
.\proton-transfer.ps1 login -Cli $protonCli
```

Crie a pasta `Trama` na raiz do Proton Drive pelo site. Escolha no Trama uma pasta local dedicada. Exemplo, se escolheu `Trama-Sync` dentro de Documentos:

```powershell
$pastaTroca = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Trama-Sync'

# Depois de “Publicar cópia”:
.\proton-transfer.ps1 upload $pastaTroca '/my-files/Trama' -Cli $protonCli

# Para trazer as cópias de outro computador:
.\proton-transfer.ps1 download '/my-files/Trama' $pastaTroca -Cli $protonCli
```

Se a política do seu Windows não permitir executar scripts PowerShell, use o helper Python diretamente, sem mudar essa política:

```powershell
py -3 .\proton_transfer.py login --cli $protonCli
py -3 .\proton_transfer.py upload $pastaTroca '/my-files/Trama' --cli $protonCli
py -3 .\proton_transfer.py download '/my-files/Trama' $pastaTroca --cli $protonCli
```

## Rotina ao trocar de computador

1. No computador A, espere o aviso de gravação local e use **Sincronização → Publicar cópia**.
2. Conclua a transferência pelo cliente de nuvem ou pelo comando `upload`.
3. No computador B, conclua a sincronização do cliente ou execute `download`.
4. No Trama do computador B, abra **Sincronização → Verificar pasta**.
5. Confira a versão recebida e use **Receber esta versão** antes de continuar a edição.
6. Ao voltar ao computador A, repita o processo na direção contrária.

Se os dois computadores produziram alterações a partir da mesma versão, há uma divergência. Examine o aviso de conflito antes de escolher o que receber. Alterações locais ainda não publicadas são guardadas em `sync-recovery` ao receber outra versão; versões que já chegaram à pasta de troca permanecem disponíveis. Não trate a data mais recente como prova de que uma versão contém todas as alterações da outra. Nenhum mecanismo de transporte garante, sozinho, a resolução correta de edições simultâneas.

## O que os helpers fazem

- Consultam os nomes na pasta remota dedicada; não percorrem o restante da sua conta.
- Enviam somente pares de snapshots válidos presentes na raiz da pasta local. Arquivos comuns, `trama.db`, subpastas e pares incompletos não são enviados.
- Transferem somente nomes ainda ausentes no destino. Cada snapshot é imutável.
- Publicam o ZIP antes do JSON e verificam SHA-256 ao receber.
- Usam a opção `skip` para conflitos da CLI. Não usam comandos de remoção, espelhamento ou substituição.
- Baixam arquivos novos para uma subpasta `.trama-proton-recebido-*` antes de promovê-los à pasta de troca. Se já existir um arquivo local diferente com o mesmo nome, a operação para e preserva o existente.

As pastas temporárias de recebimento ficam guardadas para inspeção. Depois de conferir que as cópias completas foram recebidas, você pode remover essas subpastas pelo gerenciador de arquivos. Elas não fazem parte dos snapshots publicados.

As estratégias e argumentos usados pelo helper foram conferidos no código oficial de [upload](https://github.com/ProtonDriveApps/sdk/blob/main/cli/src/commands/fileSystem/commandFileSystemUpload.ts), [download](https://github.com/ProtonDriveApps/sdk/blob/main/cli/src/commands/fileSystem/commandFileSystemDownload.ts) e [criação de pasta](https://github.com/ProtonDriveApps/sdk/blob/main/cli/src/commands/fileSystem/commandFileSystemCreateFolder.ts). Se a CLI instalada não anunciar a opção de pular conflitos, o helper interrompe a transferência e orienta a atualização.

## Limites e verificação

Os arquivos locais ZIP/JSON não ganham criptografia própria do Trama. A transferência e o armazenamento na conta são responsabilidade do cliente oficial Proton; mantenha a pasta de troca em um local adequado no seu computador.

Os testes locais verificam seleção de arquivos, integridade, ordem de publicação, preservação de cópias existentes e repetição sem rebaixar os mesmos pares. A sintaxe do helper PowerShell foi validada. Não foi realizado login nem transferência contra uma conta Proton real neste ambiente; o comportamento da CLI foi conferido na documentação e no código oficial, mas ainda precisa dessa validação na sua instalação.
