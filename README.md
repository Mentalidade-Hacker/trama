# Trama 0.9.1

Notas conectadas para uso local no Arch Linux e Windows, inspiradas no fluxo de páginas e blocos do Roam Research. Links, referências vivas, incorporações editáveis, consultas, tabelas, Kanban, templates e anexos ficam em uma base SQLite no seu computador.

Funciona sem conta e sem internet depois de instalados os requisitos. A versão 0.9 adicionou **rascunhos de aprendizagem salvos automaticamente**, amplia o dicionário inglês, sugere escolhas de vocabulário com revisão espaçada e inclui **backup completo com restauração guiada**. A correção **0.9.1** salva também a prática de tradução, preserva cartões em blocos hierárquicos, melhora a análise de textos longos e reforça a recuperação de backups. Mantém a sincronização automática opcional e a comparação de conflitos da 0.8. O tamanho das letras pode ser ajustado de 80% a 200%. Mantém os temas claro/escuro, a área **Aprender a escrever**, o vocabulário bilíngue, os exercícios, o corretor e o dicionário. Não reproduz integralmente o Roam e não é um produto oficial da empresa. A comparação concreta está em [FEATURE-COVERAGE.md](FEATURE-COVERAGE.md).

## Baixar e começar

Use os [pacotes completos na página de versões](https://github.com/Mentalidade-Hacker/trama/releases/latest). Eles incluem o dicionário de significados para consulta offline. Recomenda-se usar a **0.9.1 nos dois computadores** para obter as melhorias de conferência e comparação. O formato das cópias continua compatível com a 0.7.

- [Trama 0.9.1 — ZIP para Windows e Linux](https://github.com/Mentalidade-Hacker/trama/releases/download/v0.9.1/trama-v0.9.1-windows-linux.zip).
- [Trama 0.9.1 — TAR.GZ para Linux](https://github.com/Mentalidade-Hacker/trama/releases/download/v0.9.1/trama-v0.9.1-windows-linux.tar.gz).
- [Hashes SHA-256 da versão 0.9.1](https://github.com/Mentalidade-Hacker/trama/releases/download/v0.9.1/trama-v0.9.1-SHA256.txt).

Extraia o pacote. Com **Python 3.10 ou mais recente** e um navegador atual, abra `start.cmd` no Windows ou execute `bash start.sh` no Arch Linux. Os detalhes estão nas seções abaixo. Os pacotes contêm código-fonte e lançadores, não um executável independente do Python.

**Se você usar `git clone` ou o botão Code → Download ZIP:** essa cópia contém o código, mas não o arquivo gerado `resources/dictionary.sqlite`, de aproximadamente 494 MB. Para habilitar os significados, copie esse arquivo da pasta `trama/resources` do pacote completo para `resources` da sua cópia, ou execute na raiz do repositório:

```bash
python build_dictionary.py --download-dir work/dictionary-source
```

Esse comando baixa aproximadamente 572 MB de fontes abertas e reconstrói o dicionário local. Consulte [resources/README.md](resources/README.md) para os detalhes. Os avisos e licenças dos componentes incluídos estão em [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md); eles não definem uma licença geral para o código próprio do Trama.

## Escolher a aparência

Use o seletor **Tema** na barra superior, ou **Aparência** na barra lateral. O modo escuro é opcional: sem uma preferência anterior, o Trama abre no modo claro. **Seguir o sistema** acompanha as mudanças de tema do computador; **Claro** e **Escuro** mantêm sua escolha independentemente do sistema.

O tema escuro usa fundo carvão, texto claro suave, links azuis e cores próprias para alertas, tabelas, grafo, dicionário e exercícios. Imagens e anexos preservam suas cores. A preferência é aplicada ao abrir o aplicativo e fica salva neste navegador; ela não faz parte dos backups ou das cópias de sincronização das notas.

Para aumentar ou diminuir as letras, clique em **Aa** na barra superior ou em **Aparência → Tamanho do texto**. Use **A−**, **A+** ou o controle deslizante entre **80% e 200%**. Notas, menus, dicionário e exercícios mudam imediatamente. **Restaurar padrão** volta a 100%. O tamanho fica salvo neste navegador e pode ser diferente em cada computador, sem alterar suas notas.

## Abrir no Arch Linux

Requisitos: Python 3.10 ou mais recente e navegador atual. Extraia o pacote, abra um terminal na pasta `trama` e execute:

```bash
sudo pacman -S --needed python
bash start.sh
```

O navegador abre em **http://127.0.0.1:8765**. Mantenha o terminal aberto durante o uso; `Ctrl+C` encerra o servidor. Node.js, npm e bibliotecas Python adicionais não são necessários para as notas. O [Python está no repositório oficial do Arch](https://archlinux.org/packages/core/x86_64/python/).

Para adicionar **Trama** ao menu de aplicativos, execute sem `sudo`:

```bash
bash install.sh
```

O instalador copia o programa para `${XDG_DATA_HOME:-~/.local/share}/trama/app`, cria `~/.local/bin/trama` e preserva o banco existente. Para atualizar, encerre o servidor anterior e execute o instalador da nova pasta extraída. O atalho usa `--desktop`: Chromium/Chrome abre uma janela de aplicativo; se indisponível, usa o navegador padrão.

```bash
bash start.sh --desktop
bash start.sh --no-browser
bash start.sh --port 8766
bash start.sh --data-dir "$HOME/Documentos/minhas-notas-trama"
```

## Abrir no Windows

Instale Python 3.10 ou mais recente e extraia o pacote. Abra **start.cmd** para iniciar. **install-windows.cmd** faz a instalação por usuário; não precisa executar como administrador. Os detalhes e destinos aparecem no próprio instalador.

O servidor usa a mesma aplicação local. `--desktop` procura Edge/Chrome nos locais usuais e, se necessário, abre o navegador padrão. Também é possível usar um terminal:

```powershell
python server.py
python server.py --desktop
python server.py --data-dir "D:\Notas\Trama"
```

Fechar a janela do navegador não encerra o servidor. Use `Ctrl+C` no terminal ou encerre o processo Python do Trama no monitor de sistema/Gerenciador de Tarefas. Se já está aberto, volte ao endereço local em vez de iniciar outra cópia.

O pacote contém código-fonte e lançadores; não é um AppImage ou binário independente do Python. O corretor gramatical é opcional e requer LanguageTool/Java.

## Traduzir e aprender português e inglês

Na página, clique em **Português** para traduzir do inglês ou em **English** para traduzir do português. A tradução aparece em uma tela de estudo, com o título e os blocos da página inteira, inclusive filhos recolhidos. Escolha **Lado a lado** ou **Só tradução**. A página original permanece intacta; **Salvar como nova página** cria uma cópia editável com novos IDs e referências internas remapeadas.

O motor e os modelos precisam ser instalados uma vez: no Windows, abra **setup-translation.cmd**; no Arch, execute **bash setup-translation.sh**. O instalador usa internet para obter as dependências e os modelos; a tradução posterior é local. Consulte [TRANSLATION.md](TRANSLATION.md) para requisitos, tamanho dos downloads e pastas de dados personalizadas.

- **Praticar escrita:** esconde a tradução do trecho, permite escrever sua versão e depois revelar uma tradução possível. Diferenças não são classificadas automaticamente como erros.
- **Revisar minha escrita:** usa o LanguageTool local já integrado para explicar problemas de ortografia/gramática e oferecer sugestões individuais. Não avalia a fidelidade da tradução.
- **Guardar frase:** salva o par original/tradução, os idiomas e a origem em uma página de vocabulário comum, que acompanha os backups e a troca entre computadores.
- **Traduzir expressão:** consulta uma palavra ou expressão e permite ajustar/anotar o resultado antes de guardar.

Rótulos de links/tags simples podem ser traduzidos por meio de aliases, mantendo o destino original e sem renomear páginas conectadas. Referências, comandos, atributos, fórmulas e código são preservados; alguns rótulos junto de outra marcação permanecem originais. A tela mostra os blocos como texto de estudo: consultas e incorporações não expandem conteúdo externo; PDFs, imagens e outros anexos não são traduzidos. Páginas que misturam idiomas podem precisar de trechos separados. A tradução automática serve como referência e pode conter erros; frases divididas por links/formatação têm menos contexto.

## Escrever, conectar e reutilizar

| Ação | Como usar |
| --- | --- |
| Conectar páginas | `[[Nome da página]]`, `#tag` ou `#[[Tag com espaços]]`. |
| Backlinks e menções | Abra a página de destino; referências e menções sem link ficam abaixo do conteúdo. |
| Referenciar um bloco | Copie pelo menu e cole `((id))`. O texto acompanha o original. |
| Incorporar conteúdo | `{{embed: ((id))}}` ou `{{embed: [[Página]]}}`. Editar a incorporação altera o original. |
| Rótulos alternativos | `[rótulo]([[Página]])` ou `[rótulo](((id)))`. |
| Atributos | `Status:: [[Em andamento]]`; o nome do atributo também funciona como conexão. |
| Painel lateral | `Shift+clique` em um link; vários destinos podem ficar abertos. |
| Hierarquia | `Enter`, `Tab`, `Shift+Tab`; arraste o ponto do bloco para mover. |
| Seleção múltipla | `Shift+clique` nos pontos e use a barra de ações. |
| Diário | Nota de hoje, calendário e diário contínuo. |
| Renomear | Clique no título; links de página e tags são atualizados. |

Referências não duplicam conteúdo. Excluir o original deixa uma referência ausente. Mover preserva o ID e os filhos; duplicar cria outra identidade.

### Comandos e formatação

Digite `/` para escolher comandos de tarefas, datas, títulos, tabela, Kanban, consulta, código, fórmula, arquivo e template. O menu do bloco oferece títulos 1–3, alinhamento à esquerda/centro/direita e visualização de filhos em tópicos, lista numerada ou documento.

O texto aceita `**negrito**`, `__itálico__`, `^^destaque^^`, `~~riscado~~`, código entre crases e blocos de código cercados por três crases. Código é exibido, não executado. Fórmulas `$$...$$` usam o KaTeX incluído localmente, com o subconjunto de LaTeX suportado pela biblioteca.

| Atalho | Ação |
| --- | --- |
| `Ctrl+K` / `Ctrl+U` | Busca. |
| `Ctrl+S` | Salvar alterações pendentes. |
| `Ctrl+Alt+L` | Revisar ortografia/gramática. |
| `Enter` / `Shift+Enter` | Novo bloco / linha no mesmo bloco. |
| `Tab` / `Shift+Tab` | Recuar / subir um nível. |
| `Ctrl+Shift+↑` / `Ctrl+Shift+↓` | Reordenar entre irmãos. |
| `Ctrl+Enter` | Alternar TODO/DONE. |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+H` | Negrito / itálico / destaque. |
| `Esc` | Sair da edição. |
| `Ctrl+Z` / `Ctrl+Shift+Z` fora do editor | Desfazer / refazer alterações do grafo. |

Dentro do campo de texto, desfazer usa o navegador. Nas sugestões de `[[`, `((`, `/` e `;;`, use setas e `Enter`/`Tab`. Ao arrastar, `Shift` coloca o bloco como filho do destino; sem `Shift`, ele vai depois do destino.

Colar texto com várias linhas pode criar blocos e preservar a estrutura de tópicos/recuos. Trechos cercados por três crases são mantidos como blocos de código, em vez de serem divididos linha por linha. Isso é uma importação de estrutura básica, sem interpretar toda a linguagem Markdown.

### Templates

Crie um bloco como `Reunião #roam/templates` e coloque o conteúdo reutilizável nos filhos. Digite `;;` no destino ou use **Inserir template**. Os filhos são copiados com novos IDs; referências internas entre eles são remapeadas.

`<%today%>`, `<%yesterday%>` e `<%tomorrow%>` viram datas locais `AAAA-MM-DD` ao inserir. As cópias não continuam sincronizadas com o modelo.

## Tabelas e componentes

`/table` ou `{{table}}` cria uma tabela. **Cada filho direto inicia uma linha; a cadeia do primeiro filho forma as próximas colunas.** A primeira linha é o cabeçalho. Há edição, adição/exclusão, ordenação e colagem/cópia TSV para planilhas. `Tab` navega entre células.

As células continuam sendo blocos, com links e IDs. Filhos extras fora da cadeia de colunas são preservados e aparecem na estrutura de origem. Excluir células/linhas remove os blocos correspondentes e pode deixar referências sem destino. Limites: 1.000 linhas, 100 colunas e a profundidade máxima geral.

`/kanban` ou `{{kanban}}` usa filhos diretos como colunas e seus filhos como cartões. Edite, adicione e mova cartões pelo seletor de coluna; IDs/filhos são preservados. Não reproduz todos os gestos de arraste do Roam.

```text
{{calc: 2 + 3 * 4}}
{{slider: 0 100 50 1}}
{{word-count}}
{{pomodoro: 25}}
```

A calculadora aceita aritmética finita. O Pomodoro depende da página aberta; não é um agendamento persistente.

## Consultas

`/query` abre um construtor. Condições mais complexas podem ser escritas diretamente:

```text
{{query: {and: [[Projeto]] [[TODO]] {not: [[Arquivado]]}}}}
{{query: {or: [[Pesquisa]] [[Escrita]]}}}
{{query: {and: {search: "revisar"} {between: [[last week]] [[today]]}}}}
{{query: "Tarefas recentes" {and: [[TODO]] {daily-notes:}}}}
```

São aceitos `and`, `or`, `not`, `search`, `between`, `daily-notes`, páginas/tags e referências `((id))`. Links herdados dos ancestrais e da página entram nas condições; a busca textual examina o texto do próprio bloco. Os resultados são blocos, sem páginas como entidades de resultado independentes.

`between` usa datas diárias e links de data, não horários de criação/edição. Aceita ISO, datas em inglês e `today`, `yesterday`, `tomorrow`, `last week`, `next week`, `last month`, `next month`. Limites inclusivos. Há consultas nomeadas, agrupamento por página, ordenação e atualização; até 100 resultados são mostrados por grupo.

É um subconjunto da [linguagem de consultas do Roam](https://roamdocs.fyi/help/query), sem autoria multiplayer nem todas as opções de apresentação.

### Datalog local

O componente `{{:q ...}}` usa DataScript distribuído com o aplicativo, em execução local separada da interface. Exemplo:

```text
{{:q [:find ?title :where [?page :node/title ?title]]}}
```

O adaptador expõe um schema reduzido: `:node/title`, `:block/uid`, `:block/string`, `:block/page`, `:block/children`, `:block/refs`, `:block/order`, `:create/time`, `:edit/time`, `:block/heading` e `:block/open`. Datas de bloco não são um histórico individual de edição completo. Use apenas consultas declarativas suportadas; chamadas dinâmicas, introspecção e agregadores personalizados são bloqueados. Não há compatibilidade com extensões, funções ou schema completo do Roam.

Consultas são interrompidas após 8 segundos e a interface mostra até 200 linhas de resultado. Consultas muito amplas podem exceder esse limite mesmo em um grafo válido.

## Anexos, exportação e histórico

`/upload` ou **Arquivos** aceita até **20 MB por arquivo**. Imagens raster, áudio, vídeo e PDF reconhecidos podem ser incorporados, conforme o suporte do navegador. HTML, SVG e formatos desconhecidos são downloads. Mídia externa permanece um link para abrir, sem carregamento automático nas notas.

O salvamento é automático; confira o indicador antes de fechar. Duas janelas editando ao mesmo tempo podem gerar conflito de revisão: exporte alterações locais e recarregue, sem sobrescrever silenciosamente a versão mais nova.

| Formato/ação | Conteúdo |
| --- | --- |
| JSON Trama | Páginas, texto, hierarquia, IDs e metadados; **sem binários de anexos**. |
| JSON em formato Roam | Campos suportados de páginas/blocos; não converte todos os recursos do Roam. |
| Markdown | Intercâmbio de texto/hierarquia; não preserva toda a apresentação e os componentes. |
| Grafo completo ZIP | Estado atual, manifesto e binários dos anexos locais. |
| Histórico | Últimas 100 revisões salvas, com prévia e restauração. |
| Backup SQLite | Cópia consistente do banco; binários continuam separados em `attachments`. |

JSON aceita Trama e a lista de páginas exportada pelo Roam. Campos desconhecidos podem permanecer como texto e anexos externos não são baixados. A interface oferece substituir ou mesclar páginas; duplicações de IDs na mesclagem são remapeadas, preservando referências internas. Há backup antes da importação.

**Importar Markdown** aceita vários arquivos, até 20 MB no total. Um arquivo comum vira uma página, nomeada pelo título `#` inicial quando presente ou pelo nome do arquivo. Uma exportação Markdown identificada do Trama restaura suas páginas separadas e referências entre elas. O conteúdo é mesclado com o grafo, preservando/remapeando IDs e referências conforme necessário. Tópicos, recuos e blocos de código são reconhecidos; não há interpretação completa de Markdown, front matter ou extensões de outros aplicativos.

O ZIP deve ter sido exportado pelo Trama: máximo de **110 MB de arquivo**, **100 MB descompactados**, **5.000 anexos** e 20 MB por anexo. Restaurar substitui as notas e acrescenta anexos importados; arquivos anteriores permanecem para o histórico. Caminhos inválidos, hashes incorretos e colisões de ID com outro conteúdo são recusados.

Restaurar uma revisão cria uma nova revisão e um backup anterior. O ZIP não inclui histórico completo, preferências do navegador, configuração de sincronização ou backups. Para guardar tudo, encerre o servidor e copie a pasta inteira de dados.

### Compatibilidade com 0.1

O formato continua `version: 1`. IDs e estrutura são preservados; `heading`, `alignment` e `view` são opcionais. Ausentes, significam texto normal, esquerda e tópicos. Abrir uma base anterior acrescenta armazenamento de histórico/anexos sem apagar notas. Guarde o backup pré-atualização; não há garantia de que o aplicativo antigo interprete todos os recursos novos.

## Usar em outro computador com Proton Drive

Abra **Sincronização**, escolha uma pasta dedicada e ative **Sincronização automática** em cada computador. Há dois transportes:

- **Pasta já sincronizada:** o aplicativo Proton Drive (ou outro sincronizador) transporta a pasta; o Trama publica e recebe as alterações sozinho.
- **Proton direto:** instale a [CLI oficial](https://proton.me/support/drive-cli), use **Entrar no Proton** uma vez e indique a mesma pasta remota nos dois computadores. O próprio Trama passa a executar os envios e downloads.

Depois dessa configuração, escreva normalmente. Com ambos os servidores Trama abertos, as novas notas e os anexos chegam ao outro computador, e a página aberta é atualizada quando não há edição pendente. A chegada depende do transporte e da conexão: são verificações periódicas, não transmissão a cada tecla. Sem internet, o trabalho permanece local e o Trama tenta novamente depois.

O recebimento automático exige uma versão descendente da base atual e nenhuma alteração local concorrente. Se os dois computadores editaram antes de receber as mudanças, o painel pausa e pede uma escolha; não combina os textos automaticamente. Antes de uma escolha manual, alterações locais não publicadas são preservadas em `sync-recovery`, além do backup do banco. Na primeira conexão, um grafo local já preenchido também exige escolha antes de receber outro.

As cópias usam arquivos ZIP/JSON separados do banco em uso. Não sincronize `trama.db` diretamente. Cópias incompletas não são aplicadas, e as versões compartilhadas não são apagadas automaticamente; a pasta cresce com o histórico e os anexos repetidos. Tema e demais preferências exclusivas do navegador não fazem parte dessa sincronização. O [guia do Proton](PROTON-DRIVE.md) explica a configuração e o modo manual opcional. A transferência com uma conta Proton real ainda precisa ser validada na instalação do usuário.

## Revisão enquanto escreve e dicionário

A ortografia fica **ativa enquanto você digita**, com dicionários locais incluídos para português BR/PT e inglês US/UK. Abra **Revisão ao digitar** para escolher o idioma. Ao terminar uma palavra ou fazer uma pausa curta, o aplicativo sublinha possíveis problemas e mostra alertas abaixo do campo. Clique no alerta e na sugestão para corrigir; não há substituição silenciosa.

A gramática analisa a frase após uma pausa e usa o LanguageTool local. Ative uma vez abrindo **setup-writing.cmd** no Windows. No Arch, use `sudo pacman -S --needed languagetool` ou `bash setup-writing.sh --portable-java`. O instalador portátil baixa o servidor e Java quando necessário; depois as análises ficam no computador. A primeira análise inicia o motor e pode levar alguns segundos.

O botão **Dicionário** e o atalho **Alt + Shift + D** consultam a palavra selecionada sem internet. O pacote inclui **401.459 entradas em português** e **1.497.827 na edição inglesa completa do Wiktionary**, com definições e exemplos quando disponíveis. Esses números contam entradas por classe/flexão, não palavras únicas. **Guardar significado** adiciona um cartão ao vocabulário com a fonte e a licença.

Links, referências, código e fórmulas são protegidos. Limite automático de 20 mil unidades UTF-16 por campo; resultados antigos são descartados quando o texto muda. Palavras aceitas e preferência de idioma ficam neste navegador. A consulta de significados não cobre todas as palavras reconhecidas pelo corretor. Veja [WRITING.md](WRITING.md) e [DICTIONARY.md](DICTIONARY.md).

## Aprender a escrever

Abra **Aprender a escrever** na barra lateral para estudar palavras novas e praticar o uso delas. O material inicial reúne 60 lições de vocabulário (30 pares português/inglês), todas com duas frases traduzidas, observações de uso, alternativas contextualizadas e exercícios, além de 12 lições curtas de escrita.

Os alertas do editor têm **Entender e praticar** para levar uma correção real ao estudo. No dicionário, as classes gramaticais ganham explicações simples e os exemplos do material de estudo aparecem separados dos exemplos da fonte. É possível guardar palavras próprias, tentativas e cartões de revisão no grafo; o progresso acompanha os backups e snapshots. Não há avaliação automática de redação livre ou promessa de exemplos para todos os verbetes. Os rascunhos de **Aprender a escrever** agora são recuperados ao reabrir, com uma lista para retomar atividades. Em uma página, **Explorar palavras** oferece alternativas com significado, exemplo e cautela de uso; aceitar uma ocorrência também cria um cartão em **Aprender a escrever → Revisar**. Veja [LEARNING.md](LEARNING.md).

## Backup completo e restauração guiada

Abra **Dados e backups → Backup completo e restauração guiada**. Um ZIP reúne notas, anexos, as até 100 revisões ainda disponíveis, rascunhos de aprendizagem e preferências permitidas do navegador. Não inclui credenciais, identidade de outro dispositivo, caminhos locais, dicionário nem motores/modelos instalados. O assistente inspeciona o arquivo, mostra um resumo, pede confirmação e guarda uma cópia anterior antes de aplicar. Após restaurar, a sincronização fica desligada até você conferir e reconectar. Veja [BACKUP.md](BACKUP.md).

Limites deste formato: 256 MB de conteúdo expandido, 5.000 anexos, 20 MB por anexo. Se exceder o limite, a exportação falha claramente; não corta o conteúdo. O arquivo não é criptografado pelo Trama.

## Pastas de dados e recuperação

| Sistema | Local padrão |
| --- | --- |
| Arch Linux | `~/.local/share/trama/` |
| Windows | `%LOCALAPPDATA%/Trama/data/` |

Se já existir `~/.local/share/trama/trama.db` no Windows, esse local antigo continua sendo usado para evitar migração silenciosa. `XDG_DATA_HOME` explícito e `--data-dir` permitem outros destinos; o terminal informa o caminho.

Dentro da pasta ficam `trama.db`, `attachments/`, `backups/`, `full-backups/`, `sync-config.json` quando configurado e `sync-recovery/` quando necessário. Arquivos `trama.db-wal`/`trama.db-shm` podem existir durante o uso; preserve-os junto do banco.

Backups SQLite são criados na inicialização, por solicitação e antes de substituições; são mantidas as **20 cópias mais recentes**. Eles não duplicam os anexos. Para restaurar manualmente: encerre o servidor, guarde a pasta inteira, mova o banco atual e auxiliares para recuperação, copie o backup escolhido como `trama.db`, preserve `attachments` e reinicie.

O servidor escuta apenas em `127.0.0.1`. Limites: 32 MB por gravação, 50 mil páginas, 200 mil blocos, 100 níveis e 1 milhão de unidades UTF-16 por bloco. O grafo inteiro fica em memória; esses limites não prometem desempenho confortável em conjuntos máximos.

## Verificação e limitações

Os testes automatizados de modelo, consultas, componentes, corretor, armazenamento, ZIP, conflitos e sincronização rodam no ambiente de desenvolvimento Windows. O lançador Windows iniciou o servidor real. No navegador foram exercitados Datalog, fórmula, tabela, Kanban e publicação de snapshot em pasta isolada. A ortografia Hunspell real, a gramática LanguageTool real em PT/EN e o dicionário offline foram verificados, incluindo alertas e correções no navegador. A instalação no Arch, os instaladores no menu nativo e uma transferência real por conta Proton continuam exigindo validação nos respectivos ambientes. Nenhuma conta Proton foi acessada durante o desenvolvimento.

```bash
python -m unittest discover -s tests
node --test tests/*.test.mjs
```

Node.js é usado apenas nos testes de desenvolvimento. A aplicação usa Python padrão e recursos HTML/CSS/JavaScript locais, sem compilação. Bibliotecas e licenças ficam em `web/vendor`.

Não há colaboração multiplayer, aplicativo móvel, compatibilidade com Roam Depot/plugins, criptografia própria dos grafos, autoria multiplayer, todas as extensões Datalog do Roam ou busca semântica. A sincronização automática troca versões completas e pausa quando há divergências; não oferece a edição colaborativa simultânea do Roam. Consulte o [mapa de cobertura](FEATURE-COVERAGE.md).

O roteiro de validação da sincronização em equipamentos reais está em [TESTE-PROTON-0.9.1.md](TESTE-PROTON-0.9.1.md). O relatório da versão distingue testes executados e verificações pendentes: [RELEASE-v0.9.1.md](RELEASE-v0.9.1.md).
