# Dicionário de significados, português e inglês

O pacote completo do Trama inclui `resources/dictionary.sqlite`. Com esse arquivo, a consulta de significados funciona localmente desde a primeira abertura. O aplicativo não envia a palavra consultada nem o texto das notas para a internet.

O dicionário apresenta as definições, a classe gramatical e os exemplos que existirem na fonte. É possível aproveitar uma definição no vocabulário de estudo. Cada verbete informa sua fonte e licença.

## Conteúdo e cobertura

- **Português:** definições em português do Wikcionário, extraídas por Wiktextract e distribuídas pelo Kaikki.org.
- **Inglês:** definições da edição **English Wiktionary**, extraídas por Wiktextract/Kaikki e filtradas para palavras e expressões do idioma inglês. Na versão 0.9, esta base substitui o Simple English usado nas versões anteriores.

O Trama conserva apenas entradas do idioma correspondente que tenham definição. Os totais incluem flexões, expressões, nomes próprios e entradas separadas por classe gramatical ou etimologia; não representam apenas palavras básicas. O banco registra os totais efetivamente importados, as formas distintas após normalização e a data da construção.

O banco da versão 0.9 contém **401.459 entradas em português e 1.497.827 em inglês**: cerca de **24 vezes mais entradas inglesas** que as 61.743 anteriores. São **1.360.430 formas inglesas distintas após normalizar maiúsculas/minúsculas e espaços**. O arquivo ocupa **493.813.760 bytes**, aproximadamente 494 MB. As definições e exemplos portugueses anteriores foram preservados.

Na base inglesa ampliada há **1.793.712 sentidos e 770.517 exemplos**, distribuídos por **292.308 entradas com pelo menos um exemplo**. Isso não significa que todos os verbetes tenham exemplos: termos como `metacognition` e `overfitting` têm definição, mas não exemplos nesta extração. As classes, marcas de uso, exemplos e referências são conservados da fonte. Sinônimos são preservados na API apenas quando associados a um sentido específico; não são sugestões de substituição automática.

Não são geradas definições por inteligência artificial. Uma palavra ausente é apresentada como não encontrada na base local. A busca aceita maiúsculas e minúsculas, mas preserva as diferenças de acentuação. Expressões devem ser consultadas com a grafia usada no verbete. A fonte pode conter erros, omissões e exemplos de contextos históricos; consulte o link do verbete quando precisar verificar uma definição.

## Fontes, atribuição e licença dos dados

Os textos são de autoria dos colaboradores do Wikcionário/Wiktionary, sob **Creative Commons Atribuição-CompartilhaIgual 4.0 Internacional (CC BY-SA 4.0)**. A extração é feita pelo projeto **Wiktextract**, disponibilizada por **Kaikki.org**, mantido por Tatu Ylonen. O Trama filtra os idiomas e reorganiza os dados em SQLite; preserva as definições, os exemplos e suas referências quando fornecidas. As alterações de organização não alteram a licença do conteúdo.

- [Fonte do português e downloads](https://kaikki.org/ptwiktionary/rawdata.html).
- [Fonte do inglês e download filtrado](https://kaikki.org/dictionary/English/).
- [Direitos autorais do Wikcionário em português](https://pt.wiktionary.org/wiki/Wikcion%C3%A1rio:Direitos_autorais).
- [Direitos autorais do Wiktionary](https://en.wiktionary.org/wiki/Wiktionary:Copyrights).
- [Licença CC BY-SA 4.0 e seu texto integral](https://creativecommons.org/licenses/by-sa/4.0/).
- [Wiktextract, formato e processo de extração](https://github.com/tatuylonen/wiktextract).

O link de cada verbete dá acesso à página original e ao histórico de seus colaboradores. Exemplos que citem outras obras mantêm a referência fornecida pela fonte; materiais de terceiros podem ter condições próprias, como descrito nas páginas de direitos autorais. Ao redistribuir os dados ou adaptações, preserve a atribuição, os links de origem e a licença aplicável. Esta licença se refere ao conteúdo dos dicionários.

## Reconstruir o banco

Esta etapa é para atualizar ou reconstruir o recurso incluído no aplicativo. Não é necessária para consultar o dicionário distribuído no pacote completo. O script usa apenas a biblioteca padrão do Python.

Na pasta do projeto, execute:

```bash
python build_dictionary.py --download-dir /caminho/para/fontes --output resources/dictionary.sqlite
```

No Windows, os caminhos podem ser informados entre aspas, por exemplo:

```powershell
python build_dictionary.py --download-dir 'D:\Trama-fontes' --output 'resources\dictionary.sqlite'
```

Na construção da 0.9, as fontes comprimidas somaram **571.410.676 bytes**: 37.273.123 bytes para português e **534.137.553 bytes** para inglês. Esses valores podem mudar. Reserve aproximadamente **3 GB livres** para fontes, banco anterior e construção do novo banco. O inglês expandido tem cerca de 3,43 GB, mas o construtor lê uma linha por vez, sem salvar esse arquivo expandido. A reconstrução baixa as fontes; a consulta posterior permanece offline.

A fonte inglesa consultada foi atualizada no Kaikki em 25 de outubro de 2026, a partir do dump do Wiktionary de 1º de outubro de 2026. O Kaikki anuncia a futura retirada do download pós-processado por idioma. Esse endereço está disponível na construção da 0.9; sua retirada exigirá atualizar o processo de reconstrução, mas não afeta a consulta da base já incluída no pacote. A [fonte bruta oficial](https://kaikki.org/dictionary/rawdata.html) contém todos os idiomas e é muito maior; não é baixada por este construtor.

Downloads existentes na pasta escolhida são reutilizados. A fonte inglesa ampliada usa o nome `enwiktionary-english.jsonl.gz`, para não confundir seu cache com o antigo `en-wiktextract.jsonl.gz` do Simple English. Para reconstruir a partir de arquivos que você já tem:

```bash
python build_dictionary.py --pt pt-wiktextract.jsonl.gz --en enwiktionary-english.jsonl.gz --output resources/dictionary.sqlite
```

Para atualizar as fontes, escolha uma nova pasta de download. O banco anterior só é substituído após a importação e a verificação de integridade do novo arquivo. Feche o Trama durante uma reconstrução no Windows. O banco registra o SHA-256 dos arquivos de origem, a atribuição, a licença e a data; esse hash identifica os arquivos usados, sem constituir uma verificação independente da origem.

A variável `TRAMA_DICTIONARY_PATH` permite escolher outro arquivo de dicionário compatível. O aplicativo abre esse arquivo somente para leitura. As notas e o vocabulário ficam na base de dados do usuário e não são alterados pela reconstrução do dicionário.
