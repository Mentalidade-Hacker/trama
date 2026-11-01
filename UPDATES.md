# Atualizações do Trama

A partir da 0.10, o Trama pode baixar novas versões estáveis publicadas em [Mentalidade-Hacker/trama](https://github.com/Mentalidade-Hacker/trama/releases). A aplicação da versão acontece quando você encerra e abre o programa novamente. Não há troca de código enquanto você escreve.

## Instalar a 0.10.1 e adotar o executável Windows

A 0.9.1 e as versões anteriores não possuem o atualizador. A 0.10 já atualiza o código, mas ainda não inclui o iniciador nativo nem o Python privado do novo instalador Windows. Para adotar o EXE, faça esta instalação uma vez:

1. Salve suas alterações e crie um **Backup completo** em **Dados e backups**. Confira onde está a pasta de dados que você usa, principalmente se iniciou com `--data-dir`.
2. Use **Salvar e encerrar Trama** quando disponível, ou salve e encerre o servidor antigo com `Ctrl+C` no terminal. Fechar a aba ou janela não basta. Feche também assistentes de gramática e tradução antes de reinstalar.
3. No Windows, baixe e execute o [instalador EXE 0.10.1](https://github.com/Mentalidade-Hacker/trama/releases/download/v0.10.1/trama-v0.10.1-windows-setup.exe); mantenha o mesmo destino da instalação anterior quando aplicável. No Arch, extraia o pacote completo novo e execute `bash install.sh`. O ZIP Windows com Python externo continua oferecendo `install-windows.cmd` como alternativa. Preserve qualquer pasta de dados personalizada e os argumentos usados para abri-la.
4. Confira as notas, os anexos e os rascunhos antes de retomar o uso normal. Use o novo atalho ou a nova pasta nas próximas aberturas.

O pacote `trama-v0.10.1-update.zip` é destinado ao atualizador de código. Ele não instala o `Trama.exe` nem o Python privado. Para começar no Windows, use o EXE; para Linux ou uso pelo código-fonte, use o ZIP/TAR completo. Todos incluem o dicionário de significados. O [guia Windows](WINDOWS.md) traz o procedimento sem comandos.

Os instaladores usados pelo ZIP preparam a cópia nova antes de substituir a anterior, com recuperação em falhas comuns de troca. O instalador EXE verifica se o aplicativo ou os assistentes estão abertos antes de substituir arquivos. Notas, configuração e estado de atualizações são preservados; desinstalar o EXE também mantém os dados das notas. Pastas com conteúdo pessoal inesperado na área do programa ou links de arquivos podem impedir a instalação, com uma explicação. Guarde seus dados fora de `app` e `runtime`.

## Usar o painel Atualizações

**Baixar atualizações automaticamente** vem ativado no pacote instalado. A primeira consulta acontece pouco depois de abrir; enquanto o Trama continuar em execução, o intervalo entre verificações é de seis horas. Só versões estáveis são consideradas, não rascunhos de publicação ou versões de teste.

- **Verificar atualização** consulta a publicação mais recente e baixa a nova versão disponível. Funciona também com o download automático desligado.
- **Baixando atualização** permite continuar usando as notas. O painel mostra o progresso informado pelo download.
- **Atualização pronta para instalar** indica que o pacote foi baixado e conferido. Ele ainda não é a versão em execução.
- **Salvar e encerrar Trama** confirma o salvamento de notas e rascunhos desta janela antes de pedir o encerramento. Se houver conflito, revisão diferente ou outra janela sinalizando edição, o encerramento é recusado para você resolver a situação.

Depois de confirmar o encerramento, abra o programa novamente pelo mesmo atalho. Recarregar a página não inicia o servidor. Na 0.10.1, **Encerrar Trama** também aparece na barra lateral quando a abertura permite encerramento; funciona mesmo sem atualização pendente. No Windows, **Salvar e encerrar…** no ícone da bandeja abre essa confirmação na interface. Quando o botão não estiver disponível, salve, confira as outras janelas, encerre com `Ctrl+C` no terminal e reabra.

Desligar **Baixar atualizações automaticamente** impede futuras verificações automáticas. Não desfaz um download já iniciado nem cancela a instalação de um pacote que já ficou pronto. A opção fica neste computador; ela não é uma preferência de sincronização das notas. Cada computador precisa abrir o Trama para verificar e aplicar sua própria atualização.

Sem internet, a versão instalada continua funcionando. O painel informa a falha de consulta ou download; use **Verificar atualização** quando a conexão voltar. A publicação precisa oferecer o arquivo de atualização no formato esperado. Se ainda não o oferecer, o programa atual continua disponível.

## O que muda e o que é preservado

O pacote automático contém o código Python do aplicativo, a interface e seus recursos locais. **Não substitui o iniciador nativo `Trama.exe` nem o Python privado em `runtime`.** Para atualizar esses dois componentes no Windows, execute um instalador EXE mais recente no mesmo destino. Essa separação mantém o programa aberto intacto durante o download.

Java, LanguageTool, Proton Drive CLI, motores e modelos de tradução também têm instalação separada. O pacote automático não baixa novamente o dicionário de significados `resources/dictionary.sqlite`: as versões usam a base já instalada. Não mova a pasta do Python privado depois de configurar a tradução; o ambiente da tradução pode fazer referência a esse caminho.

Notas, anexos, rascunhos, backups, configurações de sincronização e credenciais permanecem nos locais existentes. As preferências do navegador também permanecem. A atualização não importa outro grafo nem substitui um backup. A consulta ao GitHub busca metadados de versões e arquivos do programa; não envia o conteúdo das suas notas.

| Instalação | Pasta do programa | Pasta de atualizações |
| --- | --- | --- |
| Arch, instalação por usuário | `${XDG_DATA_HOME:-~/.local/share}/trama/app` | `${XDG_DATA_HOME:-~/.local/share}/trama/.app-updates` |
| Windows, instalação por usuário | `%LOCALAPPDATA%/Trama/app` | `%LOCALAPPDATA%/Trama/.app-updates` |
| Pasta extraída usada diretamente | Uma pasta chamada `trama` | `.trama-updates`, ao lado dela |

Na instalação EXE padrão, `%LOCALAPPDATA%/Trama/Trama.exe` e `%LOCALAPPDATA%/Trama/runtime` ficam ao lado de `app`. As notas ficam em `data`, salvo uma configuração anterior ou pasta personalizada. Os logs do iniciador ficam em `%LOCALAPPDATA%/Trama/data/launcher-logs`; não entram no pacote de atualização.

O nome da pasta de atualizações acompanha o nome da pasta do programa: para uma pasta `meu-trama`, será `.meu-trama-updates` ao lado dela. É necessário poder gravar nesse local. A pasta guarda a preferência, downloads e versões preparadas, e pertence àquela instalação. Não mova nem edite seus arquivos enquanto o Trama estiver aberto. Uma reinstalação manual não copia o estado de atualizações da pasta de origem nem apaga o estado irmão da instalação de destino.

Checkouts que contêm `.git` mantêm as atualizações automáticas desativadas para preservar o trabalho de desenvolvimento. É possível continuar usando e atualizando essa cópia pelos meios habituais do repositório.

## Integridade e recuperação

O Trama usa HTTPS para consultar o repositório esperado no GitHub. Confere o tamanho e o SHA-256 do arquivo informado pela publicação, valida os caminhos permitidos no ZIP e verifica cada arquivo contra o manifesto incluído. Pacotes incompletos ou diferentes do manifesto não se tornam a versão ativa.

**HTTPS e SHA-256 não constituem uma assinatura independente do publicador.** A confiança continua dependendo da conta, do repositório e da infraestrutura de distribuição do GitHub. O manifesto ajuda a detectar corrupção e alterações nos arquivos; não fornece uma segunda identidade de assinatura.

O instalador EXE e o iniciador da 0.10.1 também **não possuem assinatura digital de um certificado do Trama**. Essa informação é distinta dos hashes de integridade. Os arquivos e os hashes esperados devem ser conferidos na publicação oficial; este guia não orienta desativar proteções do Windows.

Na próxima abertura, a versão preparada passa por nova conferência. Ela só é marcada como ativa depois de o servidor confirmar o início, incluindo a abertura do banco, sua recuperação necessária e a cópia de segurança inicial. Se não confirmar o início dentro do limite ou falhar antes disso, o lançador tenta abrir a versão anterior. Uma interrupção com `Ctrl+C` é respeitada: não reabre o programa contra a sua escolha. Após uma tentativa fracassada, a mesma versão não é baixada de novo automaticamente; uma nova tentativa é explícita pelo painel.

Essa recuperação é **do programa, não do banco de dados**. Ela não restaura uma cópia antiga das notas e não garante compatibilidade de bancos modificados por versões futuras. Também não detecta todo defeito que apareça depois de uma inicialização bem-sucedida. Continue usando o backup completo e conserve uma cópia anterior antes de mudanças importantes.

Se o programa não iniciar, preserve a pasta de dados e a mensagem exibida. No Windows nativo, tente reinstalar o EXE no mesmo destino; no uso pelo ZIP, é possível instalar o programa completo numa pasta separada e usar a mesma pasta de dados. Não apague o banco, anexos ou backups para tentar reparar uma atualização do aplicativo.

Evite finalizar apenas o processo lançador à força: o servidor filho pode continuar aberto. Use o botão do painel ou `Ctrl+C`. Uma abertura pela mesma porta ocupada falha sem confirmar a atualização. As versões baixadas são conservadas na pasta de atualizações; ainda não há limpeza automática de versões antigas nem uma tela para escolher manualmente a versão anterior.

## Conferência em equipamentos reais

Estes passos são um roteiro, não uma declaração de que foram executados:

1. **Windows:** instalar o EXE sem depender de Python no PATH, abrir pelo menu Iniciar, preparar uma atualização de código posterior publicada e conferir notas, rascunhos e um anexo depois de **Salvar e encerrar Trama** e da nova abertura. Reinstalar o EXE para conferir também a preservação dos dados.
2. **Arch:** instalar sem `sudo` numa pasta com espaços, iniciar pelo menu e pelo terminal, aplicar a atualização e conferir os mesmos dados. Confirmar também o resultado do trabalho de CI Arch; contêiner não testa o menu gráfico real.
3. **Conexão indisponível:** desligar a internet durante uma consulta ou download e confirmar que a versão atual e as notas continuam disponíveis. Reconectar e pedir nova verificação.
4. **Duas janelas:** deixar uma editando e confirmar que a outra não encerra o servidor pelo painel de atualização até as alterações serem resolvidas.
5. **Proton entre dois computadores:** após atualizar cada um, enviar uma nota, um bloco filho e um anexo nas duas direções; conferir sessão, conteúdo e hashes do anexo. O atualizador não valida sua conta ou uma transferência Proton real.

Registre versões, sistema e resultado de cada passo. A validação específica de Proton continua em [TESTE-PROTON-0.10.md](TESTE-PROTON-0.10.md).
