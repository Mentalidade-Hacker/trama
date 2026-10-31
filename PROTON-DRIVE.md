# Trama em mais de um computador com Proton Drive

O Trama 0.7 pode enviar e receber notas e anexos automaticamente, enquanto estiver aberto nos computadores. Ative a opção uma vez em cada máquina; depois, novas versões seguras chegam sem clicar em Publicar/Receber, e o navegador atualiza as notas quando não há edição pendente.

O mecanismo usa cópias completas em uma pasta separada do banco. Verifica mudanças periodicamente (aproximadamente 3 segundos para pasta, 10 segundos para Proton direto, além do tempo de transferência). Não oferece edição simultânea letra a letra: alterações concorrentes pausam o recebimento e pedem revisão. Sem internet, as notas ficam locais até a conexão voltar. Um link público do Proton não hospeda o Trama.

## Ativar uma vez e usar automaticamente

1. Instale o Trama 0.7 ou mais recente nas duas máquinas e entre na mesma conta Proton.
2. Crie uma pasta dedicada para as cópias. No Windows, pode ser uma subpasta de **My files** dentro do Proton Drive; mantenha-a disponível neste dispositivo. Para Proton direto, use uma pasta local vazia como `Trama-Sync` e crie a pasta `Trama` na raiz do Drive pelo site.
3. Abra **Sincronização** no Trama e informe a pasta local. Escolha **Pasta já sincronizada** se o aplicativo Proton transfere essa pasta; escolha **Proton direto** para usar a CLI oficial no Arch ou no Windows.
4. Para Proton direto, instale a CLI conforme abaixo, informe o executável caso não esteja no PATH e clique **Entrar no Proton**. Conclua o login no navegador oficial. Use a mesma pasta remota, por exemplo `/my-files/Trama`, nas duas máquinas.
5. Ative **Sincronização automática** e salve. No segundo computador vazio, as notas chegam sozinhas. Se ele já contém notas, escolha a versão inicial no painel antes de continuar.

O indicador de sincronização informa atividade, falhas e conflitos. Em modo pasta, o Trama confirma apenas a troca local; confira o estado da nuvem no aplicativo Proton. Em modo direto, o Trama executa o transporte e informa falhas. Fechar o servidor Trama interrompe esse serviço. As notas já recebidas continuam no disco.

Se aparecer **conflito**, mantenha as cópias dos dois computadores e revise a escolha. O Trama não escolhe a versão mais recente pela data nem mescla textos divergentes automaticamente. **Receber esta versão** substitui o conteúdo atual, preservando backup e alterações não publicadas. A pasta de versões não é limpa automaticamente e pode crescer, sobretudo com anexos.

## Escolha como transportar os arquivos

| Situação | Transporte |
| --- | --- |
| Já tem uma pasta local sincronizada pelo aplicativo Proton Drive | Escolha uma subpasta dedicada como **Pasta de troca** no Trama. O cliente Proton transfere seus arquivos. |
| Arch Linux ou Proton direto no Windows | Instale a CLI oficial e ative o transporte direto no Trama. Os helpers continuam disponíveis para transferências manuais. |
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

## Rotina opcional com o modo automático desativado

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

No auxiliar manual, as pastas temporárias de recebimento ficam guardadas para inspeção. Depois de conferir que as cópias completas foram recebidas, você pode remover essas subpastas pelo gerenciador de arquivos. No modo automático, os arquivos temporários conhecidos da própria tentativa são removidos ao concluir ou interromper a transferência; arquivos inesperados são preservados. As cópias completas da pasta de troca permanecem intactas. Essas subpastas não fazem parte dos snapshots publicados. Transferências automáticas têm limite de dez minutos por comando, com cancelamento ao encerrar o Trama.

As estratégias e argumentos usados pelo helper foram conferidos no código oficial de [upload](https://github.com/ProtonDriveApps/sdk/blob/main/cli/src/commands/fileSystem/commandFileSystemUpload.ts), [download](https://github.com/ProtonDriveApps/sdk/blob/main/cli/src/commands/fileSystem/commandFileSystemDownload.ts) e [criação de pasta](https://github.com/ProtonDriveApps/sdk/blob/main/cli/src/commands/fileSystem/commandFileSystemCreateFolder.ts). Se a CLI instalada não anunciar a opção de pular conflitos, o helper interrompe a transferência e orienta a atualização.

## Limites e verificação

Os arquivos locais ZIP/JSON não ganham criptografia própria do Trama. A transferência e o armazenamento na conta são responsabilidade do cliente oficial Proton; mantenha a pasta de troca em um local adequado no seu computador.

Os testes locais verificam seleção de arquivos, integridade, ordem de publicação, preservação de cópias existentes e repetição sem rebaixar os mesmos pares. A sintaxe do helper PowerShell foi validada. Não foi realizado login nem transferência contra uma conta Proton real neste ambiente; o comportamento da CLI foi conferido na documentação e no código oficial, mas ainda precisa dessa validação na sua instalação.
