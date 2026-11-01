# Trama 0.11 — espaço para escrever e conectar ideias

A página principal passa a destacar título, blocos e conexões. Tradução, revisão, dicionário e vocabulário ficam em **Mais**, no topo; aprendizado e ferramentas secundárias ficam em **Ferramentas**, na lateral. **Aa** reúne tema e tamanho do texto. O indicador de sincronização deixa de aparecer repetido em vários lugares.

## Conexões com contexto

- Sugestões de `[[páginas]]` e `#tags` priorizam correspondências e toleram diferenças de acento, mantendo a identidade das páginas.
- A busca de `((blocos))` aceita identificadores e termos do texto, da página e dos pais. Cada resultado mostra uma prévia e seu caminho de origem.
- **Referenciar outro bloco**, no menu do bloco e no comando `/reference`, permite inserir uma referência viva sem conhecer seu identificador.
- **Conexões** e os contadores junto aos blocos tornam visíveis os usos recebidos. A contagem considera blocos de origem distintos; repetir a referência no mesmo bloco não multiplica o número.
- Referências vinculadas, referências a blocos e menções sem link mostram pais e filhos como contexto. A edição nessa área atua sobre o bloco original, mantendo sua hierarquia.
- **Vincular menção** converte uma menção sem link em ligação. **Shift+clique** nos links internos abre o destino no painel lateral.
- **Ctrl/Cmd + arrastar** cria uma referência em vez de mover o original; **Shift** acrescentado ao gesto insere como filho do destino.

O guia [WORKSPACE.md](WORKSPACE.md) explica esses fluxos e a diferença entre referência viva e cópia de texto.

## Revisão mais discreta

Os sublinhados continuam aparecendo enquanto você escreve. O painel começa compacto em **N sugestões** e abre palavras, explicações e substituições sob demanda. Blocos sem alertas deixam de repetir mensagens de verificação. Erros de funcionamento do corretor continuam visíveis.

Ortografia e regras básicas em português e inglês permanecem incluídas. A análise ampliada de gramática com LanguageTool é opcional; o aplicativo não passa a interpretar toda frase nem aplica correções sem a escolha do usuário.

## Atualização e dados

A 0.10.2 pode receber a 0.11 pelo painel **Atualizações**, usando o pacote de código menor em vez de baixar novamente o instalador Windows completo. Depois de confirmar o salvamento e encerrar o aplicativo, reabra pelo mesmo atalho. O tamanho e os hashes definitivos pertencem aos artefatos publicados desta versão.

O pacote de atualização não contém notas, anexos, rascunhos, configurações de sincronização ou credenciais. O dicionário e os modelos já instalados são reutilizados. O atualizador continua separado da sincronização: conflitos entre notas precisam de resolução própria. Atualizações do executável nativo ou do Python privado ainda exigem o instalador Windows correspondente. Consulte [UPDATES.md](UPDATES.md).

## Limites e verificação

As listas de conexões exibem até 50 referências diretas, com até 3 níveis de descendentes, 200 blocos incluindo contexto e 5 ancestrais no caminho. A apresentação resumida pode limitar o trecho a 1.200 caracteres e usar texto simples; a edição do bloco original mantém o conteúdo completo. Os limites da prévia são informados na interface.

A edição de um original pela área de conexões foi conferida no navegador e na leitura posterior dos dados, incluindo a preservação dos filhos. A criação de referência por Ctrl/Cmd + arrastar tem testes automatizados do modelo e dos eventos, mas o gesto físico no navegador ainda não foi confirmado. Os resultados consolidados e as verificações de distribuição constam no relatório da publicação; este documento não antecipa resultados de CI ou de instalações não executadas.

Continuam fora desta versão os links `[[...]]` aninhados, a equivalência integral aos filtros avançados de referências do Roam e a colaboração simultânea em tempo real. A integração com Proton em conta real entre Windows e Arch também não é comprovada por estes testes de interface. Não há promessa de paridade integral com o Roam Research.
