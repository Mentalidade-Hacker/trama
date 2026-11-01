# Cobertura funcional — Trama 0.11

A versão 0.11 prioriza escrever notas e conectá-las: ferramentas secundárias recolhidas, sugestões de páginas/tags/blocos, referências com ancestrais e filhos, edição no original e painel lateral. Veja [WORKSPACE.md](WORKSPACE.md) e [RELEASE-v0.11.md](RELEASE-v0.11.md). Os limites são explícitos; nenhuma equivalência integral ao Roam é afirmada. Os resultados executados de cada distribuição constam em seu relatório de publicação.


Este documento descreve os arquivos entregues. **Completo no escopo** indica que o fluxo local descrito está implementado, sem afirmar equivalência integral com o Roam. **Parcial** lista diferenças. **Ausente** significa não incluído. Não há porcentagem de paridade.

Esta revisão cobre os fluxos de escrita, hierarquia, ligações, referências, consultas e troca entre computadores implementados no Trama. Não houve comparação automatizada contra uma conta Roam. O [Roam Research](https://roamresearch.com/) e seu [catálogo oficial de extensões](https://github.com/Roam-Research/roam-depot) continuam produtos e ecossistemas separados. Os estados e limites abaixo vêm da implementação e dos testes do Trama.

## Conteúdo e conexões

| Função | Estado | Entregue e limites |
| --- | --- | --- |
| Aparência | Completo no escopo | Claro (padrão sem preferência), Escuro opcional e Seguir o sistema. Tamanho do texto de 80% a 200%, com A−/A+, prévia imediata e restauração do padrão. Preferências locais por navegador, aplicadas antes da primeira exibição e atualizadas entre janelas da mesma origem. Mídia preserva suas cores. |
| Páginas, links e tags | Completo no escopo | Criação, navegação, autocomplete, backlinks e atualização ao renomear. Código, fórmulas, URLs e rótulos de aliases não criam conexões falsas nem são alterados ao renomear. Sugestões aceitam busca sem acento, mas a identidade preserva os acentos; namespaces não têm apresentação configurável. Os links aninhados não são suportados. |
| Menções sem link | Completo no escopo | Busca textual com contexto, edição do original e ação de vincular; sem detecção semântica. |
| Blocos hierárquicos | Completo no escopo | IDs estáveis, recuo, recolhimento, foco, duplicação, reordenação e movimentação entre páginas. Importação e recuo respeitam o limite de 100 níveis aceito pelo armazenamento. |
| Referências a blocos | Completo no escopo | Conteúdo vivo, busca por texto/contexto/ID, contador por blocos-fonte e aviso de destino ausente/circular. |
| Incorporações de blocos/páginas | Parcial | Editáveis sobre os dados originais; sem todas as variantes e conversões do Roam. |
| Aliases/atributos | Parcial | Rótulos de links e `Nome::` como conexão; sem propriedades tipadas completas. |
| Diário | Completo no escopo | Hoje, seletor de data e diário contínuo; títulos novos em ISO. |
| Painel lateral | Parcial | Vários destinos editáveis e conexões com contexto; Shift+clique em links internos abre o destino. Organização/atalhos não idênticos ao Roam. |
| Seleção múltipla | Parcial | Ações coletivas; não reproduz todos os gestos e atalhos do Roam. |
| Formatação | Parcial | Títulos 1–3, alinhamento, tópicos/listas/documento, negrito/itálico/destaque/riscado e código. Sem Markdown completo. |
| LaTeX | Parcial | KaTeX local; subconjunto aceito pela biblioteca. |
| Templates | Parcial | `#roam/templates`, `/template`, `;;`, cópias com novos IDs e referências internas remapeadas; três marcadores de data. Sem linguagem arbitrária de automação. |
| Busca e grafo | Parcial | Busca textual e conexões navegáveis; sem semântica, IA ou indexação externa. |

## Consultas e componentes

| Função | Estado | Entregue e limites |
| --- | --- | --- |
| Consultas booleanas | Parcial | `and`, `or`, `not`, `search`, páginas/tags/referências; herança dos ancestrais/página e nomes de consultas. Resultados são blocos. |
| Datas | Parcial | `between` inclusivo, `daily-notes`, ISO/datas em inglês e sete datas relativas. Não filtra timestamps de edição. |
| Construtor de consultas | Parcial | Formulário, agrupamento, ordenação e atualização; aninhamento avançado na sintaxe e até 100 resultados por grupo. |
| Datalog local | Parcial | DataScript incluído, executado separadamente; schema reduzido documentado no README. Chamadas declarativas, limite de 8 segundos e 200 linhas exibidas. |
| Datalog específico do Roam | Ausente | Sem schema completo, extensões personalizadas, funções internas ou equivalência à API do Roam. |
| Filtros por autores | Ausente | Sem `by`, `created-by`, `edited-by` e sem autoria multiplayer. |
| Tabelas | Parcial | Blocos como células; filhos diretos são linhas, cadeia de primeiro filho são colunas. Cabeçalho, edição, ordem, adição/exclusão e TSV; ramificações extras preservadas. Sem seleção retangular completa, redimensionamento ou arraste equivalente de linhas/colunas. |
| Kanban | Parcial | Colunas/cartões são blocos; mudança de coluna por seletor preserva IDs/filhos. Sem todos os gestos de arrastar do Roam. |
| TODO/DONE | Completo no escopo | Caixas interativas, atalhos e uso em consultas. |
| Calculadora/slider/contagem | Parcial | Aritmética finita, valor numérico e contagem local; nenhum código arbitrário nas notas é executado. |
| Pomodoro | Parcial | Enquanto a página está aberta; sem agendamento persistente. |
| Botão de template | Parcial | Insere um template por referência; não executa plugins/macros arbitrários. |

Os componentes e consultas usam blocos reais do grafo local. A tabela descreve o subconjunto entregue, sem assumir compatibilidade com todos os controles, filtros de autoria ou extensões do Roam.

## Arquivos, recuperação e computadores

| Função | Estado | Entregue e limites |
| --- | --- | --- |
| Uso local/offline | Completo no escopo | SQLite e servidor loopback, sem conta. Dependências instaladas previamente. |
| Arch e Windows | Parcial | Servidor portátil e lançadores por sistema; lançador Windows executado com servidor real. Instalação Arch e menu dos instaladores nativos não executados aqui. |
| Anexos locais | Completo no escopo | Upload/listagem, IDs, 20 MB por arquivo; mídia/PDF reconhecidos incorporáveis. HTML/SVG são downloads. |
| Anexos externos | Parcial | Links preservados; importação não baixa arquivos da nuvem do Roam. |
| JSON Trama | Completo no escopo | `version: 1`, IDs, hierarquia e metadados opcionais; sem binários. |
| JSON Roam | Parcial | Campos suportados de páginas/blocos, UIDs e metadados; não converte todos os componentes. |
| Markdown e colagem de tópicos | Parcial | Até 20 MB de entrada, tópicos/recuos/código, títulos de blocos e continuação de parágrafos. Exportações marcadas do Trama restauram páginas separadas e referências entre elas; Markdown comum continua uma página por arquivo. Sem Markdown completo, front matter, metadados completos ou cópia integral da apresentação; use JSON/ZIP para fidelidade completa. |
| Cofre ZIP | Completo no escopo | Estado atual, manifesto, binários, validação, backup e troca transacional. Limites: 110 MB ZIP, 100 MB expandidos e 5.000 anexos. Sem histórico completo/preferências. |
| Histórico | Completo no escopo | 100 revisões, prévia e restauração como nova revisão; anexos anteriores preservados. |
| Backup SQLite | Completo no escopo | Cópia consistente e retenção de 20; binários separados. |
| Conflito entre janelas | Parcial | Recusa sobrescrita antiga e preserva edição pendente. Atualização de dados recebidos respeita alterações locais; não há mescla colaborativa de texto. |
| Troca entre computadores | Parcial | Modo automático opcional publica alterações salvas e recebe a próxima versão segura enquanto o Trama está aberto. Usa cópias imutáveis, verificação de integridade e recuperação. Divergências ou primeira associação com conteúdo diferente exigem escolha; não há mescla silenciosa nem garantia de atualização instantânea. |
| Proton Drive | Parcial | Pasta sincronizada pelo cliente Proton ou transporte automático pela CLI oficial no Windows/Linux, após configuração e login inicial. Sem senha Proton dentro do Trama. A transferência depende da conexão e do serviço; nenhuma transferência real com conta foi executada neste ambiente. |
| Ortografia ao digitar | Completo no escopo | Hunspell local com quatro variantes incluídas, sublinhados, sugestões por clique e termos aceitos. Campos de notas, tabelas, colunas Kanban e prática. Limite de 20 mil unidades UTF-16 por campo. |
| Gramática ao digitar PT/EN | Parcial | LanguageTool local opcional, análise após pausa, sugestões individuais e proteção de sintaxe. Motor real testado em PT/EN no Windows; sem regras Premium/IA. |
| Dicionário de significados | Parcial | Base offline incluída: 401.459 entradas PT e 1.497.827 entradas da edição English Wiktionary, com classes/fontes e exemplos presentes na origem. Uma fonte maior não garante todos os termos nem exemplos em cada verbete. |
| Tradução local PT/EN | Parcial | Botões por página, leitura lado a lado, todos os blocos da página, cópia independente e motor offline CTranslate2 com modelos Argos. Modelos exigem instalação inicial. Rótulos de links simples usam aliases traduzidos com destinos preservados. Código, fórmulas, comandos, anexos e conteúdo externo não são traduzidos. |
| Prática com tradução | Completo no escopo | Tentativa antes de revelar a tradução, revisão opcional com LanguageTool, frases/expressões salvas como blocos no grafo. Sem pontuação automática de qualidade ou avaliação de fidelidade. |
| Aprender a escrever | Completo no escopo | 60 lições de vocabulário em 30 pares PT/EN, duas frases traduzidas por lição, alternativas contextualizadas, exercícios e 12 lições de escrita. Conjunto inicial finito; não é um curso completo ou professor conversacional. |
| Correções e revisão de estudo | Completo no escopo | Guarda correções reais e tentativas como cartões; revisão com resposta revelada, autoavaliação e próxima data. Progresso no grafo acompanha backups/snapshots. Sem inferência automática de domínio ou nota para redações. |

## Ausências explícitas

| Função | Estado | Limite |
| --- | --- | --- |
| Colaboração/permissões de equipe | Ausente | Sem presença, compartilhamento, comentários multiplayer ou usuários. |
| Mesclagem colaborativa em tempo real | Ausente | O modo automático transfere versões com segurança; não une caracteres editados simultaneamente nos dois computadores. Divergências preservam alternativas e exigem escolha. |
| Aplicativos móveis | Ausente | Sem Android/iOS ou serviço remoto móvel. |
| Roam Depot, roam/js e plugins | Ausente | Extensões e scripts Roam não são instalados/executados. |
| Grafos criptografados | Ausente | Sem criptografia própria dos arquivos locais; a proteção do transporte não substitui proteção do disco. |
| Schema/API completos do Roam | Ausente | APIs locais e adaptador reduzido; nenhuma promessa de compatibilidade integral. |
| Busca semântica/IA | Ausente | Sem embeddings ou geração de texto. |
| Todos os atalhos/componentes | Ausente | Nenhuma alegação de equivalência de teclado, macros, gráficos e automações. |

## Verificação

Há testes para modelo, consultas, metadados, templates, componentes, proteção do corretor, conflitos, histórico, anexos, ZIP, rollback, dois computadores simulados e proteção de sintaxe na tradução. Os novos testes de ligações/renomeação verificam código, URLs, aliases e fórmulas; os testes Markdown verificam blocos multilinha, cercas de código incompletas e referências entre páginas. A versão 0.7 passou também na verificação automatizada do GitHub em Windows e Ubuntu. A tradução real PT↔EN, os dicionários ortográficos reais e o LanguageTool real foram verificados no Windows. Respostas controladas do corretor validam aplicação de sugestões, não qualidade linguística.

Arch Linux, instaladores nativos, transferência real com conta Proton não foram executados diretamente neste ambiente. Veja [README.md](README.md) e [PROTON-DRIVE.md](PROTON-DRIVE.md). Esta tabela descreve o escopo entregue, sem transformar planos em recursos disponíveis.

## Melhorias da sincronização na 0.8

Comparação somente de leitura com contagens e amostras, confirmação vinculada à versão comparada, tentativas com espera progressiva, nome do computador, horários de eventos separados, detecção de servidor indisponível e proteção durante composição de texto. O transporte Proton verifica conteúdo remoto antes de ignorar arquivos existentes e confirma uploads. Modo manual não realiza rede ao verificar a pasta. Testes com conta Proton real permanecem pendentes.

## Aprendizagem e recuperação na 0.9 e 0.9.1

- Rascunhos de Aprender a escrever e do exercício de tradução: gravação no navegador e SQLite, recuperação ao reabrir, versões separadas em conflito e inclusão no backup completo. A tradução preserva origem e referência sem depender de nova consulta. São locais; práticas explicitamente guardadas e cartões continuam no grafo sincronizado.
- Explorar palavras: repetições e alternativas opcionais de 40 famílias autorais PT/EN. Aceitar uma ocorrência guarda o cartão para revisão. Não é análise semântica nem avaliação automática da qualidade da escrita.
- Backup completo: notas, anexos, histórico disponível, rascunhos e preferências permitidas, com inspeção, confirmação e cópia prévia. Limites explícitos e sincronização desligada após restaurar.
- Correções da 0.9.1: análise de marcações longas sem as buscas quadráticas reproduzidas; contagem real com até 40 ocorrências exibidas; cartões e entradas de vocabulário podem ser indentados sem perder sua identidade; publicação atômica do registro de restauração e preservação do link de recuperação quando o armazenamento do navegador falha.
