# Escrever e conectar ideias no Trama

A tela principal da versão 0.11 dá espaço ao título, aos blocos e às conexões da nota. Comece uma ideia nas **Notas diárias** ou crie uma página. Você pode organizar depois: cada bloco mantém sua identidade ao ser movido.

## Um fluxo simples

1. Escreva uma ideia por bloco. **Enter** cria outro bloco; **Shift+Enter** continua no mesmo.
2. Use **Tab** para tornar um bloco filho do anterior e **Shift+Tab** para voltar um nível. A seta ao lado do ponto recolhe ou expande os filhos.
3. Digite `[[Projeto]]` para ligar a ideia à página Projeto. O editor fecha os colchetes e oferece páginas existentes ou a opção de criar uma.
4. Abra Projeto e confira **Referências vinculadas** abaixo das notas. Ali aparecem os blocos que apontam para essa página, com seu contexto.

O salvamento é automático. O indicador no topo informa se há alterações pendentes ou algum problema para salvar.

## Páginas, tags e referências a blocos

| Quero… | Como fazer |
| --- | --- |
| Conectar uma página | Digite `[[Nome da página]]` e escolha uma sugestão ou conclua o título. |
| Marcar um assunto | Use `#ideia`. Tags com espaços usam `#[[Ideia de projeto]]`; a busca de tags também sugere páginas. |
| Reutilizar uma ideia específica | Digite `((` e procure o bloco. Ao aceitar a sugestão, o Trama insere `((UID))`, usando o identificador real daquele bloco. |
| Inserir uma referência pelo menu | Abra **⋯** no bloco e escolha **Referenciar outro bloco**. Também é possível digitar `/reference` e aceitar o comando sugerido. |
| Copiar uma referência para outro lugar | Use **Copiar referência** no bloco e cole o resultado no destino. |
| Consultar sem sair da nota | Use **Shift+clique** em um link interno de página, referência a bloco ou caminho de contexto para abrir o painel lateral. |

Uma referência a bloco é viva: ela exibe o conteúdo do original. Alterar o original muda o que aparece nas referências; copiar o texto comum cria conteúdo independente. `UID` nos exemplos representa o identificador do bloco, não uma palavra que você precisa digitar literalmente.

Na busca de blocos, você pode usar o identificador, palavras do texto, o nome da página ou termos dos blocos pais. As sugestões mostram um trecho e o caminho de origem. A busca tolera diferenças de acento; isso **não une páginas diferentes**: “Cafe” e “Café” continuam com identidades distintas.

## Entender de onde vem uma conexão

O botão **Conexões**, junto ao título, leva às referências recebidas quando elas existem. O número conta os blocos que fazem a ligação, não quantas vezes o mesmo link foi repetido em um bloco. Um número junto a um bloco indica quantos blocos fazem referência a ele.

**Referências vinculadas** reúne as notas que usam o link da página. **Referências a este bloco** reúne os usos de uma referência específica. Os caminhos mostram a página e os blocos pais; os filhos aparecem abaixo para ajudar a entender a ideia completa. Filhos mostrados somente como contexto não aumentam a contagem de referências diretas.

Você pode editar os blocos exibidos nas conexões. **Essa edição altera o original**, preservando seu identificador e sua hierarquia; não cria uma cópia da nota. Use a seta **↗** para abrir o original. Se o contexto deixar de estar disponível durante uma edição, o Trama pode continuar no bloco original.

Em **Menções sem link**, o aplicativo procura menções ao nome da página que ainda não são links. **Vincular menção** transforma a ocorrência em uma ligação. Confira o contexto antes de vincular: um mesmo nome pode ter sentidos diferentes. O campo **Filtrar por texto ou contexto…** ajuda a encontrar resultados na lista exibida.

## Organizar por arraste

Arraste o ponto de um bloco até outro para movê-lo. Segure **Shift** ao soltar para colocá-lo como filho do destino.

Com **Ctrl** — ou **Cmd** em um teclado que tenha essa tecla — durante a soltura, o gesto cria um novo bloco com uma referência ao original, mantendo o original onde estava. Combine com **Shift** para inserir a referência como filha do destino. Sem Shift, ela entra depois do bloco de destino.

O gesto de criar referências por arraste tem testes automatizados do modelo e dos eventos. Ainda não foi confirmado por um arraste real no navegador nesta versão. Como alternativa, use `((` ou **Referenciar outro bloco**.

## Ferramentas sem ocupar a nota

- **Mais**, no topo: revisão manual, dicionário, idioma e revisão ao digitar, tradução e vocabulário.
- **Aa**: tema e tamanho das letras. As preferências continuam disponíveis sem uma barra de controles em cada página.
- **Ferramentas**, na lateral: Aprender a escrever, Calendário, Templates, Arquivos e Histórico.
- **Aplicativo**, na lateral: Dados e backups, Guia e atalhos e Encerrar Trama, quando a abertura permite encerramento pela interface.
- **Sincronização e Atualizações** mantêm seus indicadores na lateral.

A revisão continua sublinhando possíveis problemas enquanto você escreve. **N sugestões** abre os alertas e suas explicações; clicar em uma substituição aplica somente aquela correção. Um bloco sem alertas fica sem mensagens repetidas de “verificado”. Falhas do corretor e limites de revisão continuam visíveis. Ortografia e regras básicas são locais; a análise ampliada com LanguageTool permanece opcional. Consulte [WRITING.md](WRITING.md).

## Limites das conexões

Cada lista exibe até **50 blocos de referência direta**, com até **3 níveis de descendentes** e **200 blocos no total** contando o contexto. O caminho mostra até **5 ancestrais**; caminhos maiores indicam os níveis omitidos. A interface informa quando há conteúdo fora da prévia e permite abrir o original. Esses limites não apagam nem encurtam as notas.

Quando uma prévia usa a apresentação resumida, em vez do editor do bloco original, o trecho fica limitado a **1.200 caracteres** e pode aparecer como texto simples para evitar expansão recursiva. A edição do original usa o texto inteiro.

O Trama não oferece links de página aninhados como `[[Projeto [[Parte]]]]`, todos os filtros avançados de referências do Roam nem colaboração simultânea em tempo real. É um aplicativo local de notas conectadas, sem equivalência integral ao Roam. A sincronização entre computadores usa cópias e resolução explícita de conflitos; consulte [PROTON-DRIVE.md](PROTON-DRIVE.md).

## Atualizar sem baixar o instalador inteiro

Na 0.10.2, abra **Atualizações** e use **Verificar atualização**, ou aguarde a busca automática. Quando a 0.11 estiver pronta, use **Salvar e encerrar Trama**, aguarde a confirmação e abra pelo mesmo atalho. Se aparecer um aviso de salvamento ou conflito, resolva-o antes de encerrar.

Esse fluxo baixa o pacote de código, sem repetir o instalador Windows completo ou o dicionário já instalado. Notas, anexos, rascunhos, modelos e configurações de sincronização ficam fora desse pacote. A atualização não resolve conflitos de notas nem substitui um backup. O tamanho exato do download consta na publicação da versão. Detalhes e recuperação: [UPDATES.md](UPDATES.md).
