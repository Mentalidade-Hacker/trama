# Tradução local entre português e inglês

O Trama usa modelos de tradução do Argos Translate com CTranslate2 e SentencePiece. Depois da instalação, a tradução funciona no computador, inclusive sem internet. O instalador baixa programas e modelos; o texto das notas fica no computador.

São dois modelos, um para inglês → português e outro para português → inglês. Eles produzem uma tradução automática que pode precisar de revisão. O modelo de português não permite escolher entre português brasileiro e europeu.

## Instalar no Windows

Instale Python 3.10 ou mais recente, de 64 bits. Uma versão recém-lançada do Python pode ainda não ter os pacotes necessários disponíveis. Abra `setup-translation.cmd` na pasta do Trama e aguarde a instalação. Se preferir usar PowerShell:

```powershell
.\setup-translation.cmd
```

Se aparecer um erro ao carregar o motor, instale o [Microsoft Visual C++ Redistributable x64](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) e execute o instalador novamente. Os pacotes atuais do motor oferecem suporte ao Windows x86-64.

## Instalar no Arch Linux

Com o Python instalado pelo gerenciador de pacotes do sistema, execute na pasta do Trama:

```bash
bash setup-translation.sh
```

O ambiente de tradução é separado do Python do sistema. O instalador usa pacotes binários do PyPI; se não existir uma versão compatível com seu Python ou sua arquitetura, ele informa a falha. A documentação do CTranslate2 lista Linux x86-64 e AArch64 entre as plataformas com pacotes binários.

## Download e armazenamento

Os modelos oficiais 1.9 consultados somam **135.626.415 bytes, aproximadamente 136 MB**, além dos pacotes do motor. Reserve cerca de **1 GB livre** para o ambiente, os modelos, os arquivos de download e versões anteriores. O tamanho pode mudar se o índice oficial atualizar os modelos.

O instalador mantém os arquivos `.argosmodel` na subpasta `downloads`. O SHA-256 de cada arquivo baixado fica registrado em `models/<par>/trama-install.json`, com a origem do download. Esse registro identifica o arquivo instalado; o índice consultado não publica um hash independente para comparar com o download.

Os caminhos padrão são:

| Sistema | Pasta de tradução |
| --- | --- |
| Windows | `%LOCALAPPDATA%\Trama\data\translation` |
| Arch Linux | `~/.local/share/trama/translation` |

Se `XDG_DATA_HOME` estiver definido, vale `<XDG_DATA_HOME>/trama/translation`. No Windows, uma base antiga existente em `~/.local/share/trama` continua usando essa pasta. Se o Trama foi iniciado com uma pasta de dados personalizada, instale em `<pasta-de-dados>/translation` ou configure `TRAMA_TRANSLATION_HOME` tanto no instalador quanto no aplicativo.

Para escolher outra pasta no Windows:

```powershell
$env:TRAMA_TRANSLATION_HOME = 'D:\Trama\translation'
.\setup-translation.cmd
.\start.cmd
```

No Linux:

```bash
export TRAMA_TRANSLATION_HOME="$HOME/Documentos/Trama/translation"
bash setup-translation.sh
bash start.sh
```

A variável vale para os programas abertos a partir desse terminal. Para conferir uma instalação sem baixar nada:

```bash
python setup_translation.py --check
```

Também é possível usar `--directory CAMINHO`. Esse argumento escolhe apenas o destino do instalador; o aplicativo precisa usar a mesma pasta por `TRAMA_TRANSLATION_HOME` ou pela sua pasta de dados.

## Modelos já baixados e reinstalação

É possível fornecer os dois arquivos oficiais previamente baixados:

```bash
python setup_translation.py --model-file en_pt=translate-en_pt-1_9.argosmodel --model-file pt_en=translate-pt_en-1_9.argosmodel
```

Esse modo ainda pode precisar da internet para instalar os pacotes Python. Para uma máquina totalmente desconectada, prepare o ambiente completo nela antes de desconectá-la. Não copie o ambiente Python entre sistemas operacionais ou versões diferentes do Python.

O instalador valida nomes, tamanho, tipo de arquivo e o par de idiomas antes de extrair um pacote. Extrai os arquivos necessários à tradução e conserva os metadados e avisos de licença disponíveis. Os modelos ficam em `models/en_pt` e `models/pt_en`; o ambiente Python fica em `runtime`.

Executar novamente completa uma instalação interrompida. `--refresh` reinstala os modelos e conserva a pasta anterior como `.en_pt-previous-<identificador>` ou `.pt_en-previous-<identificador>`. As notas não fazem parte dessa instalação.

## Usar no Trama

Na página, clique em **Português** (inglês → português) ou **English** (português → inglês). Se instalou os modelos enquanto o Trama estava aberto, clique em **Verificar e traduzir novamente**. Você pode ler lado a lado, praticar sua própria versão, guardar frases e traduzir expressões. **Salvar como nova página** mantém o original e cria uma cópia editável.

Rótulos de links simples podem ser traduzidos sem alterar os destinos. Código, fórmulas, comandos, nomes de atributos, referências e anexos ficam preservados. A tradução considera os blocos da própria página, incluindo filhos recolhidos; não expande consultas nem conteúdo incorporado de outras páginas. Frases interrompidas por links ou formatação têm menos contexto para o tradutor.

Os cartões de vocabulário são blocos comuns na página **Vocabulário · Português e English**. Eles acompanham os backups e a troca de versões entre computadores. Os modelos e o ambiente de tradução precisam ser instalados em cada computador e não fazem parte do ZIP de notas.

## Rascunhos da prática na 0.9.1

**Praticar escrita** salva sua tentativa automaticamente no navegador e no banco local. Ao reabrir, entre em **Aprender a escrever → Retomar um rascunho**. A atividade conserva original e referência e pode ser retomada mesmo com o motor de tradução indisponível. O botão **Continuar em Aprender** leva à mesma tentativa; **Guardar minha prática** a registra no grafo e agenda a revisão.

O rascunho é local e entra no backup completo; só a prática guardada no grafo acompanha a sincronização das notas. A tentativa aceita 20.000 unidades UTF-16; referências muito longas são abreviadas a 12.000 por campo, com aviso. Alterar o texto original ou a tradução inicia outra atividade, preservando a anterior.

## Verificações anteriores e da correção 0.9.1

A instalação e a tradução real nos dois sentidos foram verificadas no Windows com Python 3.13, CTranslate2 4.8.4, SentencePiece 0.2.2 e modelos Argos 1.9. Também foram conferidos no navegador o salvamento da cópia, a hierarquia, o rótulo traduzido do link, a prática e o vocabulário. A instalação no Arch não foi executada neste ambiente. Na versão 0.4, o LanguageTool real também foi testado no Windows.

O parágrafo anterior registra verificações de versões anteriores. Na 0.9.1, os testes de interface usaram uma resposta controlada de tradução para conferir o salvamento e a recuperação, inclusive com o tradutor de teste desligado. Isso não é uma nova avaliação do motor nem da qualidade das traduções. Veja [RELEASE-v0.9.1.md](RELEASE-v0.9.1.md).

## Fontes

- [Índice oficial de modelos Argos](https://github.com/argosopentech/argospm-index): seleção dos pares `en_pt` e `pt_en`.
- [Formato de pacotes do Argos Translate](https://github.com/argosopentech/argos-translate/blob/master/argostranslate/package.py): estrutura dos modelos e metadados.
- [Tokenização do Argos Translate](https://github.com/argosopentech/argos-translate/blob/master/argostranslate/tokenizer.py): SentencePiece.
- [Instalação do CTranslate2](https://opennmt.net/CTranslate2/installation.html): requisitos e plataformas.
- [SentencePiece](https://github.com/google/sentencepiece): tokenização local.
