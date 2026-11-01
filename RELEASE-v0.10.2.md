# Trama 0.10.2 — fechamento automático de links

Ao digitar o segundo `[` em um bloco, o editor passa a formar `[[]]`, mantendo o cursor entre os dois pares. Digite o título e use as sugestões de páginas normalmente. O mesmo comportamento vale para referências a blocos com `((` → `(())`.

Digitar `]` ou `)` antes de um fechamento existente avança o cursor, sem duplicar o caractere. Aceitar uma sugestão no meio de um título agora substitui o restante desse título e consome o fechamento uma única vez. Colagens e importações preservam seu texto; a composição pelo método de entrada não é interceptada.

A versão pode chegar pelo painel **Atualizações** da 0.10/0.10.1. Após o download ficar pronto, use **Salvar e encerrar** e abra novamente pelo atalho. O instalador Windows completo também inclui a correção.

## Revisão da escrita

As regras básicas incluídas agora reconhecem a saudação portuguesa sem acento em contextos como `Ola tudo bem ?`, sugerem `Olá` e removem o espaço antes do ponto de interrogação. Também reconhecem alguns casos do pronome inglês `i` que deve ser escrito `I`. São sugestões locais, com explicação e substituição somente após sua escolha. Links, código, endereços e outras marcações ficam protegidos.

A revisão manual **Abc** passa a usar os dicionários ortográficos incluídos e as regras básicas mesmo sem LanguageTool. Quando disponível, o motor opcional acrescenta a análise de gramática e estilo. Falhas de um motor são informadas sem apagar as sugestões dos demais. As regras básicas não representam uma análise gramatical completa de frases arbitrárias.

Os testes e verificações de distribuição executados para esta versão constam no relatório da publicação. Resultados da versão 0.10.1 permanecem históricos. A sincronização Proton entre Windows e Arch reais continua dependendo do checklist do usuário; esta correção de editor não comprova essa integração.
