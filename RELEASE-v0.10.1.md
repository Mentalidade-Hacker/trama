# Trama 0.10.1 — instalador Windows com Python incluído

A 0.10.1 acrescenta um **instalador EXE para Windows**. Ele inclui o iniciador nativo `Trama.exe`, o aplicativo, os recursos offline e um CPython privado **3.14.10** da distribuição oficial NuGet. O uso normal deixa de exigir instalar Python separadamente ou iniciar por um arquivo de terminal. O [guia Windows](WINDOWS.md) mostra o caminho de download, instalação e abertura pelo menu Iniciar.

## Mudanças

- **Abertura sem console:** o iniciador usa o Python privado e abre a janela do Trama. Argumentos são transmitidos diretamente ao processo, sem montagem de comandos em um shell.
- **Bandeja e instância única por instalação:** o ícone permite abrir a janela e pedir **Salvar e encerrar…**. Uma segunda abertura sinaliza a instância existente, em vez de criar outro servidor da mesma instalação.
- **Encerramento pela interface:** **Encerrar Trama** fica disponível mesmo sem atualização pendente. A confirmação salva notas e rascunhos desta janela, respeitando conflitos e outras janelas que sinalizem edição. A bandeja abre esse mesmo fluxo; não mata o processo para forçar a saída.
- **Instalação e reinstalação:** o instalador verifica se o aplicativo ou um assistente está aberto antes de substituir arquivos. Preserva os dados e o estado de atualizações; a desinstalação também mantém as notas e os arquivos que não pertencem ao pacote instalado.
- **Assistentes opcionais:** os atalhos **Configurar gramática** e **Configurar tradução** usam o Python privado para baixar os componentes necessários. Ortografia e dicionário de significados já fazem parte do pacote; LanguageTool/Java e o motor/modelos de tradução continuam opcionais.
- **Execução com Python privado:** o iniciador usa flags para ignorar configurações externas de Python e pacotes do usuário, preserva argumentos como pasta de dados e porta, e mantém o código de saída do processo. Os logs ficam na área de dados, em `data/launcher-logs`.

O núcleo e o fluxo de uso no Linux continuam disponíveis nos pacotes ZIP/TAR com Python 3.10 ou mais recente. Esta versão não acrescenta um executável Linux independente de Python.

## Relação com as atualizações automáticas

O mecanismo introduzido na 0.10 continua ativo: baixa o código do aplicativo, confere a integridade e aplica uma versão preparada na próxima abertura. Ele **não atualiza o `Trama.exe` nem o Python privado**. Para obter ou atualizar esses componentes, execute o instalador EXE correspondente. Quem usava a 0.10 pelo ZIP precisa fazer essa instalação uma vez para adotar o iniciador nativo.

Notas, anexos, rascunhos, configurações e credenciais permanecem fora do pacote de código. O dicionário principal instalado é reutilizado. A recuperação de uma inicialização mal-sucedida volta ao programa anterior; não restaura uma versão antiga do banco nem substitui o backup. Consulte [UPDATES.md](UPDATES.md).

## Verificações registradas nesta preparação

O iniciador foi **compilado como WinExe x64 com o compilador do .NET Framework no Windows**. Os **30 checks locais** passaram pela entrada reproduzível `tests/windows_launcher_checks.ps1`, incluindo transmissão real de argumentos com espaços, acentos, aspas e barras; mutex entre processos; trava de arquivo compatível com o lançador Python; helper silencioso para o instalador; seleção do runtime privado; abertura silenciosa duplicada; e seleção dos assistentes.

Esses checks usam um executável de captura para conferir argumentos e não comprovam, sozinhos, a instalação visual do EXE final, os downloads completos dos motores opcionais ou a instalação em todas as versões do Windows. Resultados consolidados das suítes, empacotamento, CI e testes do instalador distribuído devem ser registrados no relatório final da [publicação 0.10.1](https://github.com/Mentalidade-Hacker/trama/releases/tag/v0.10.1), sem inferi-los a partir deste registro local.

Continua pendente a validação de uma **conta Proton real entre Windows e Arch**. Os testes de sincronização com pastas ou respostas controladas não substituem essa transferência. A integração com um desktop Arch real também exige conferência própria; execução em contêiner não cobre menus e janelas nativos. O roteiro está em [TESTE-PROTON-0.10.md](TESTE-PROTON-0.10.md).

## Distribuição

O instalador EXE e o iniciador **não possuem assinatura digital de um certificado do Trama**. Os hashes publicados ajudam a verificar integridade, mas não equivalem a essa assinatura. As verificações de atualização continuam dependendo da publicação e da infraestrutura GitHub. Não há orientação para desativar proteções do Windows.

O relatório histórico da versão que introduziu o atualizador permanece em [RELEASE-v0.10.md](RELEASE-v0.10.md). O Trama continua inspirado no Roam Research, sem paridade integral ou vínculo oficial com a empresa; os recursos e limites estão em [FEATURE-COVERAGE.md](FEATURE-COVERAGE.md).
