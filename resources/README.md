# Dicionário distribuído com o aplicativo

O aplicativo procura o dicionário de significados em `resources/dictionary.sqlite`. O arquivo gerado tem aproximadamente **88,5 MB** e é incluído nos [pacotes completos das versões](https://github.com/Mentalidade-Hacker/trama/releases/latest).

Esse banco **não é versionado no Git**. Portanto, `git clone` e o ZIP de código-fonte oferecido pelo botão **Code** do GitHub não incluem o dicionário. As notas continuam funcionando; a consulta de significados precisa do arquivo adicional.

Escolha uma destas formas de obtê-lo:

1. Baixe o [ZIP completo da versão 0.6](https://github.com/Mentalidade-Hacker/trama/releases/download/v0.6/trama-v0.6-windows-linux.zip) e copie `trama/resources/dictionary.sqlite` para a pasta `resources` desta cópia do código.
2. Na raiz do repositório, com Python 3.10 ou mais recente, reconstrua o banco:

   ```bash
   python build_dictionary.py --download-dir work/dictionary-source
   ```

A reconstrução baixa aproximadamente 42 MB de fontes abertas e gera `resources/dictionary.sqlite`. A pasta `work` e o banco gerado são ignorados pelo Git. Reserve cerca de 500 MB livres durante o processamento. As consultas posteriores são locais e não usam internet.

O banco contém definições do Wikcionário em português e do Simple English Wiktionary, extraídas por Wiktextract/Kaikki.org; não é um banco de notas pessoais. Ele guarda a origem, a data de construção e os hashes dos arquivos utilizados. A versão incluída tem 401.459 entradas em português e 61.743 em inglês simplificado, contando flexões e classes gramaticais separadas.

Os dados são atribuídos aos colaboradores do Wikcionário/Wiktionary sob **CC BY-SA 4.0**. Consulte [DICTIONARY.md](../DICTIONARY.md) e [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) para fontes, licenças, cobertura e detalhes de reconstrução.
