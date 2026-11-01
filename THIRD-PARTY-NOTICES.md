# Componentes e dados de terceiros

O Trama inclui componentes com licenças próprias. Os avisos e textos de licença originais acompanham os arquivos correspondentes e devem ser preservados ao redistribuí-los. Este inventário não substitui esses textos.

**Não foi definida uma licença geral para o código próprio do Trama neste repositório.** Sua disponibilização pública não representa uma declaração de licença MIT ou de outra licença para todo o aplicativo. As licenças listadas aqui se aplicam aos respectivos componentes e dados de terceiros.

## Componentes incluídos no código-fonte

| Componente | Versão | Licença ou aviso de origem | Arquivos e procedência |
| --- | --- | --- | --- |
| KaTeX, distribuição JavaScript/CSS e fontes | 0.19.1 | MIT; copyright Khan Academy e colaboradores | [Licença incluída](web/vendor/katex/LICENSE); [projeto KaTeX](https://github.com/KaTeX/KaTeX). |
| DataScript, distribuição JavaScript | 1.8.1 | Eclipse Public License 1.0 | [Licença](web/vendor/datascript/LICENSE) e [origem, versão e integridade](web/vendor/datascript/SOURCE.md). |
| Hunspell WebAssembly e wrapper `hunspell-wasm` | 0.3.0 | Licenciamento múltiplo GPL/LGPL/MPL; ver a observação abaixo | [GPL](web/vendor/spelling/hunspell/COPYING), [LGPL](web/vendor/spelling/hunspell/COPYING.LESSER), [MPL](web/vendor/spelling/hunspell/COPYING.MPL); [procedência e instruções de compilação](web/vendor/spelling/SOURCE.md). |
| Dicionário ortográfico português brasileiro, `dictionary-pt` | 4.0.0 | O pacote declara LGPL-3.0 ou MPL-2.0; os créditos e condições originais estão no aviso incluído | [Aviso do dicionário](web/vendor/spelling/pt-BR/license). |
| Dicionário ortográfico português europeu, `dictionary-pt-pt` | 2.0.0 | GPL-2.0 ou LGPL-2.1 ou MPL-1.1 | [Aviso do dicionário](web/vendor/spelling/pt-PT/license). |
| Dicionário ortográfico inglês americano, `dictionary-en` | 4.0.0 | MIT e BSD, com créditos e avisos das fontes SCOWL | [Aviso completo](web/vendor/spelling/en-US/license). |
| Dicionário ortográfico inglês britânico, `dictionary-en-gb` | 3.0.0 | MIT e BSD, com créditos e avisos das fontes SCOWL | [Aviso completo](web/vendor/spelling/en-GB/license). |
| nspell, alternativa preservada, não carregada pelo aplicativo | 2.1.5 | MIT | [Licença e fontes](web/vendor/spelling/source/nspell/license). |
| is-buffer, dependência da alternativa nspell | 2.0.5 | MIT | [Licença e fontes](web/vendor/spelling/source/is-buffer/LICENSE). |

O manifesto original de `hunspell-wasm` declara `(LGPL-2.0 OR GPL-2.0 OR MPL-1.1)`. Os textos fornecidos pelo mesmo pacote e preservados aqui incluem GPL 2, LGPL 2.1 e MPL 1.1. Esta documentação registra essa diferença entre a declaração do pacote e o texto LGPL incluído, sem reescrever as condições originais. Consulte também os cabeçalhos das fontes correspondentes em `web/vendor/spelling/hunspell/lib/hunspell`.

Os binários do Hunspell e suas fontes correspondem ao commit upstream `8f755ef64e8b047b77b676f9698b3dfa5cb1887d`. O motor WebAssembly e as fontes upstream não foram modificados pela integração. Os arquivos `.aff` e `.dic` completos e seus avisos são mantidos em cada pasta de idioma. [SOURCE.md](web/vendor/spelling/SOURCE.md) detalha a origem; [packages.json](web/vendor/spelling/packages.json) registra os pacotes e hashes de integridade.

## Dicionário de significados incluído nos pacotes de versão

O arquivo `resources/dictionary.sqlite` é gerado e distribuído nos pacotes completos das versões, não no histórico Git. Suas definições vêm dos colaboradores do **Wikcionário em português** e do **English Wiktionary**, extraídas pelo projeto **Wiktextract** e disponibilizadas por **Kaikki.org**, mantido por Tatu Ylonen.

Os textos são disponibilizados sob [Creative Commons Atribuição-CompartilhaIgual 4.0 Internacional](https://creativecommons.org/licenses/by-sa/4.0/). O Trama filtra os idiomas e reorganiza os dados para consulta local; mantém as definições, os exemplos e as referências fornecidas. Cada verbete tem um link para a página de origem e seu histórico. Exemplos atribuídos a outras obras conservam a referência da fonte; materiais de terceiros podem ter condições próprias indicadas pelo Wiktionary.

- [Dados do Wikcionário em português](https://kaikki.org/ptwiktionary/rawdata.html).
- [Dados do English Wiktionary filtrados para inglês](https://kaikki.org/dictionary/English/).
- [Direitos autorais do Wikcionário](https://pt.wiktionary.org/wiki/Wikcion%C3%A1rio:Direitos_autorais) e [do Wiktionary](https://en.wiktionary.org/wiki/Wiktionary:Copyrights).
- [Detalhes da distribuição, cobertura e reconstrução](DICTIONARY.md).

O manifesto dentro do banco registra a atribuição, a licença, a data e os hashes das fontes usadas. A licença dos dados do dicionário não estabelece uma licença geral para o código do Trama.

## Dependências opcionais obtidas separadamente

Os instaladores opcionais podem obter **LanguageTool**, **Eclipse Temurin**, **CTranslate2**, **SentencePiece** e modelos de tradução distribuídos pelo **Argos Translate**. Seus ambientes, modelos e arquivos de download não são incluídos neste repositório nem nos pacotes básicos do Trama. Cada distribuição conserva suas próprias licenças e avisos. As fontes utilizadas e o funcionamento dos instaladores estão em [WRITING.md](WRITING.md) e [TRANSLATION.md](TRANSLATION.md).

O programa oficial **Proton Drive CLI** também é instalado separadamente; os auxiliares do Trama apenas chamam esse programa. Consulte [PROTON-DRIVE.md](PROTON-DRIVE.md). As marcas de terceiros identificam compatibilidade ou origem, sem indicar vínculo ou patrocínio.
