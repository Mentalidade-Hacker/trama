# Atualizações do Trama

A partir da 0.10, o Trama pode baixar novas versões estáveis publicadas em [Mentalidade-Hacker/trama](https://github.com/Mentalidade-Hacker/trama/releases). A aplicação da versão acontece quando você encerra e abre o programa novamente. Não há troca de código enquanto você escreve.

## Começar pela 0.10

A 0.9.1 e as versões anteriores não possuem esse atualizador. Faça a primeira atualização manual:

1. Salve suas alterações e crie um **Backup completo** em **Dados e backups**. Confira onde está a pasta de dados que você usa, principalmente se iniciou com `--data-dir`.
2. Encerre o servidor antigo com `Ctrl+C` no terminal. Fechar a aba ou janela do navegador não basta.
3. Baixe o pacote completo da 0.10, extraia em uma pasta de programa nova e preserve a pasta de dados anterior. Use `install-windows.cmd` no Windows ou `bash install.sh` no Arch para atualizar a instalação por usuário. Se usa a pasta extraída diretamente, abra `start.cmd` ou `bash start.sh` nela, com os mesmos argumentos de dados que já usava.
4. Confira as notas, os anexos e os rascunhos antes de retomar o uso normal. Use o novo atalho ou a nova pasta nas próximas aberturas.

O pacote `trama-v0.10-update.zip` é destinado ao atualizador. Para uma primeira instalação, use o pacote completo: ele inclui o dicionário de significados e os arquivos necessários para começar.

Os instaladores preparam a cópia nova antes de substituir a anterior. Uma falha comum de cópia ou ativação tenta manter ou restaurar o programa anterior. Pastas com bancos de notas, links de arquivos ou conteúdo pessoal inesperado não são substituídas silenciosamente: o instalador interrompe com uma explicação. Guarde seus dados fora da pasta que contém o programa.

## Usar o painel Atualizações

**Baixar atualizações automaticamente** vem ativado no pacote instalado. A primeira consulta acontece pouco depois de abrir; enquanto o Trama continuar em execução, o intervalo entre verificações é de seis horas. Só versões estáveis são consideradas, não rascunhos de publicação ou versões de teste.

- **Verificar atualização** consulta a publicação mais recente e baixa a nova versão disponível. Funciona também com o download automático desligado.
- **Baixando atualização** permite continuar usando as notas. O painel mostra o progresso informado pelo download.
- **Atualização pronta para instalar** indica que o pacote foi baixado e conferido. Ele ainda não é a versão em execução.
- **Salvar e encerrar Trama** confirma o salvamento de notas e rascunhos desta janela antes de pedir o encerramento. Se houver conflito, revisão diferente ou outra janela sinalizando edição, o encerramento é recusado para você resolver a situação.

Depois de confirmar o encerramento, abra o programa novamente pelo mesmo atalho. Recarregar a página do navegador não inicia o servidor. Quando o botão de encerramento não estiver disponível, use **Salvar notas antes de fechar**, confira as outras janelas, encerre com `Ctrl+C` no terminal e reabra.

Desligar **Baixar atualizações automaticamente** impede futuras verificações automáticas. Não desfaz um download já iniciado nem cancela a instalação de um pacote que já ficou pronto. A opção fica neste computador; ela não é uma preferência de sincronização das notas. Cada computador precisa abrir o Trama para verificar e aplicar sua própria atualização.

Sem internet, a versão instalada continua funcionando. O painel informa a falha de consulta ou download; use **Verificar atualização** quando a conexão voltar. A publicação precisa oferecer o arquivo de atualização no formato esperado. Se ainda não o oferecer, o programa atual continua disponível.

## O que muda e o que é preservado

O pacote automático contém o código, a interface e os recursos distribuídos com o aplicativo. Ele não instala ou atualiza Python, Java, LanguageTool, Proton Drive CLI, motores e modelos de tradução. Também não baixa novamente o dicionário de significados `resources/dictionary.sqlite`: as versões usam a base já instalada. Se uma novidade exigir um desses componentes, sua instalação continua separada.

Notas, anexos, rascunhos, backups, configurações de sincronização e credenciais permanecem nos locais existentes. As preferências do navegador também permanecem. A atualização não importa outro grafo nem substitui um backup. A consulta ao GitHub busca metadados de versões e arquivos do programa; não envia o conteúdo das suas notas.

| Instalação | Pasta do programa | Pasta de atualizações |
| --- | --- | --- |
| Arch, instalação por usuário | `${XDG_DATA_HOME:-~/.local/share}/trama/app` | `${XDG_DATA_HOME:-~/.local/share}/trama/.app-updates` |
| Windows, instalação por usuário | `%LOCALAPPDATA%/Trama/app` | `%LOCALAPPDATA%/Trama/.app-updates` |
| Pasta extraída usada diretamente | Uma pasta chamada `trama` | `.trama-updates`, ao lado dela |

O nome da pasta de atualizações acompanha o nome da pasta do programa: para uma pasta `meu-trama`, será `.meu-trama-updates` ao lado dela. É necessário poder gravar nesse local. A pasta guarda a preferência, downloads e versões preparadas, e pertence àquela instalação. Não mova nem edite seus arquivos enquanto o Trama estiver aberto. Uma reinstalação manual não copia o estado de atualizações da pasta de origem nem apaga o estado irmão da instalação de destino.

Checkouts que contêm `.git` mantêm as atualizações automáticas desativadas para preservar o trabalho de desenvolvimento. É possível continuar usando e atualizando essa cópia pelos meios habituais do repositório.

## Integridade e recuperação

O Trama usa HTTPS para consultar o repositório esperado no GitHub. Confere o tamanho e o SHA-256 do arquivo informado pela publicação, valida os caminhos permitidos no ZIP e verifica cada arquivo contra o manifesto incluído. Pacotes incompletos ou diferentes do manifesto não se tornam a versão ativa.

**HTTPS e SHA-256 não constituem uma assinatura independente do publicador.** A confiança continua dependendo da conta, do repositório e da infraestrutura de distribuição do GitHub. O manifesto ajuda a detectar corrupção e alterações nos arquivos; não fornece uma segunda identidade de assinatura.

Na próxima abertura, a versão preparada passa por nova conferência. Ela só é marcada como ativa depois de o servidor confirmar o início, incluindo a abertura do banco, sua recuperação necessária e a cópia de segurança inicial. Se não confirmar o início dentro do limite ou falhar antes disso, o lançador tenta abrir a versão anterior. Uma interrupção com `Ctrl+C` é respeitada: não reabre o programa contra a sua escolha. Após uma tentativa fracassada, a mesma versão não é baixada de novo automaticamente; uma nova tentativa é explícita pelo painel.

Essa recuperação é **do programa, não do banco de dados**. Ela não restaura uma cópia antiga das notas e não garante compatibilidade de bancos modificados por versões futuras. Também não detecta todo defeito que apareça depois de uma inicialização bem-sucedida. Continue usando o backup completo e conserve uma cópia anterior antes de mudanças importantes.

Se o programa não iniciar, preserve a pasta de dados e as mensagens exibidas no terminal. É possível reinstalar um pacote completo numa pasta de programa separada e usar a mesma pasta de dados. Não apague o banco, anexos ou backups para tentar reparar uma atualização do aplicativo.

Evite finalizar apenas o processo lançador à força: o servidor filho pode continuar aberto. Use o botão do painel ou `Ctrl+C`. Uma abertura pela mesma porta ocupada falha sem confirmar a atualização. As versões baixadas são conservadas na pasta de atualizações; ainda não há limpeza automática de versões antigas nem uma tela para escolher manualmente a versão anterior.

## Conferência em equipamentos reais

Estes passos são um roteiro, não uma declaração de que foram executados:

1. **Windows:** a partir da 0.10, preparar uma atualização posterior publicada; conferir notas, rascunhos e um anexo antes e depois de **Salvar e encerrar Trama** e da nova abertura pelo atalho.
2. **Arch:** instalar sem `sudo` numa pasta com espaços, iniciar pelo menu e pelo terminal, aplicar a atualização e conferir os mesmos dados. Confirmar também o resultado do trabalho de CI Arch; contêiner não testa o menu gráfico real.
3. **Conexão indisponível:** desligar a internet durante uma consulta ou download e confirmar que a versão atual e as notas continuam disponíveis. Reconectar e pedir nova verificação.
4. **Duas janelas:** deixar uma editando e confirmar que a outra não encerra o servidor pelo painel de atualização até as alterações serem resolvidas.
5. **Proton entre dois computadores:** após atualizar cada um, enviar uma nota, um bloco filho e um anexo nas duas direções; conferir sessão, conteúdo e hashes do anexo. O atualizador não valida sua conta ou uma transferência Proton real.

Registre versões, sistema e resultado de cada passo. A validação específica de Proton continua em [TESTE-PROTON-0.10.md](TESTE-PROTON-0.10.md).
