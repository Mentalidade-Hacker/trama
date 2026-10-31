# Dicionário de significados, português e inglês

O pacote completo do Trama inclui `resources/dictionary.sqlite`. Com esse arquivo, a consulta de significados funciona localmente desde a primeira abertura. O aplicativo não envia a palavra consultada nem o texto das notas para a internet.

O dicionário apresenta as definições, a classe gramatical e os exemplos que existirem na fonte. É possível aproveitar uma definição no vocabulário de estudo. Cada verbete informa sua fonte e licença.

## Conteúdo e cobertura

- **Português:** definições em português do Wikcionário, extraídas por Wiktextract e distribuídas pelo Kaikki.org.
- **Inglês:** definições em inglês simplificado do **Simple English Wiktionary**, também extraídas por Wiktextract/Kaikki. Esta edição é compacta e tem cobertura menor que o Wiktionary completo em inglês.

As páginas das fontes consultadas em 31 de outubro de 2026 indicavam aproximadamente 566 mil sentidos em português e 73 mil em inglês simplificado. Esses números incluem flexões e vários sentidos para a mesma palavra; não representam palavras distintas. O Trama conserva apenas verbetes do idioma correspondente que tenham uma definição. O banco registra a quantidade efetivamente importada e a data da construção.

O banco incluído nesta versão foi construído em 31 de outubro de 2026: **401.459 entradas em português e 61.743 em inglês**, incluindo flexões e entradas separadas por classe gramatical. Seu arquivo ocupa aproximadamente **88,5 MB**.

Não são geradas definições por inteligência artificial. Uma palavra ausente é apresentada como não encontrada na base local. A busca aceita maiúsculas e minúsculas, mas preserva as diferenças de acentuação. Expressões devem ser consultadas com a grafia usada no verbete. A fonte pode conter erros, omissões e exemplos de contextos históricos; consulte o link do verbete quando precisar verificar uma definição.

## Fontes, atribuição e licença dos dados

Os textos são de autoria dos colaboradores do Wikcionário/Wiktionary, sob **Creative Commons Atribuição-CompartilhaIgual 4.0 Internacional (CC BY-SA 4.0)**. A extração é feita pelo projeto **Wiktextract**, disponibilizada por **Kaikki.org**, mantido por Tatu Ylonen. O Trama filtra os idiomas e reorganiza os dados em SQLite; preserva as definições, os exemplos e suas referências quando fornecidas. As alterações de organização não alteram a licença do conteúdo.

- [Fonte do português e downloads](https://kaikki.org/ptwiktionary/rawdata.html).
- [Fonte do inglês simplificado e downloads](https://kaikki.org/simplewiktionary/rawdata.html).
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

O script baixa cerca de **42 MB** de arquivos JSONL comprimidos com gzip: 37.273.123 bytes para a fonte portuguesa e 4.726.754 bytes para a fonte inglesa na versão consultada. Esses valores podem mudar com as atualizações. Reserve aproximadamente **500 MB livres** para downloads, processamento e banco final. A reconstrução usa internet para baixar as fontes; a consulta no aplicativo permanece offline.

Downloads existentes na pasta escolhida são reutilizados. Para reconstruir a partir de arquivos que você já tem:

```bash
python build_dictionary.py --pt pt-wiktextract.jsonl.gz --en en-wiktextract.jsonl.gz --output resources/dictionary.sqlite
```

Para atualizar as fontes, escolha uma nova pasta de download. O banco anterior só é substituído após a importação e a verificação de integridade do novo arquivo. Feche o Trama durante uma reconstrução no Windows. O banco registra o SHA-256 dos arquivos de origem, a atribuição, a licença e a data; esse hash identifica os arquivos usados, sem constituir uma verificação independente da origem.

A variável `TRAMA_DICTIONARY_PATH` permite escolher outro arquivo de dicionário compatível. O aplicativo abre esse arquivo somente para leitura. As notas e o vocabulário ficam na base de dados do usuário e não são alterados pela reconstrução do dicionário.
