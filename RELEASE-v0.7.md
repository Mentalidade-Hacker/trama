# Trama 0.7

Sincronização automática opcional entre computadores e correções no núcleo de notas conectadas.

## Sincronização

- Depois de configurar o transporte em cada computador, o Trama publica alterações salvas e recebe versões novas automaticamente enquanto está aberto.
- Use uma pasta já sincronizada pelo aplicativo Proton Drive ou o transporte pela CLI oficial da Proton no Windows e no Linux, com login inicial pelo navegador.
- A tela acompanha versões recebidas quando isso pode ser feito sem descartar uma edição local pendente.
- O estado da sincronização indica atividade, espera, falha ou divergência. Uma falha de conexão mantém as notas locais disponíveis e o envio pode ser tentado novamente.
- Alterações simultâneas que gerem versões divergentes são preservadas e exigem escolha. O modo automático não combina silenciosamente textos editados nas duas máquinas.

O envio depende da conexão, do tamanho das notas/anexos e do transporte. Não é edição colaborativa por caractere nem uma promessa de atualização instantânea. O Proton Drive precisa ser configurado; o aplicativo não recebe sua senha. Consulte `PROTON-DRIVE.md` para o passo a passo.

## Escrita e conexões

- **Aa → Tamanho do texto** aumenta ou diminui as letras de 80% a 200%, com prévia imediata, preferência salva neste navegador e botão para restaurar o padrão. Vale para notas, menus, dicionário e exercícios, nos temas claro e escuro.
- O desfazer dentro dos campos de prática preserva o histórico das notas.
- Código e fórmulas deixam de criar ligações falsas. Renomear uma página preserva exemplos literais, URLs e rótulos de aliases, enquanto atualiza os destinos reais.
- URLs soltas passam a ser clicáveis, sem transformar seus fragmentos em tags do grafo.
- Blocos de código ainda sem fechamento continuam literais.
- Importação e recuo de blocos respeitam o limite de 100 níveis aceito pelo armazenamento.
- Markdown preserva parágrafos multilinha, cabeçalhos e cercas de código. Exportações identificadas do Trama voltam como páginas separadas, com referências entre blocos remapeadas entre páginas. JSON/ZIP continuam sendo os formatos para preservar todos os metadados.
- O formato Markdown identificado também preserva listas literais dentro de um bloco e código ainda sem fechamento, sem absorver os blocos seguintes. Metadados das cópias recebidas passam por validação antes da exibição.

## Baixar e abrir

Baixe `trama-v0.7-windows-linux.zip` ou `trama-v0.7-windows-linux.tar.gz`. O arquivo `trama-v0.7-SHA256.txt` permite conferir os downloads. Os arquivos automáticos **Source code** do GitHub não incluem a base de significados; use o pacote completo para ter o dicionário incluído.

O uso básico requer Python 3.10 ou mais recente e um navegador atual.

- **Windows:** extraia o pacote e abra `start.cmd`.
- **Arch Linux:** instale Python (`sudo pacman -S --needed python`) e execute `bash start.sh` na pasta extraída.

Gramática e tradução local mantêm seus instaladores opcionais. Ortografia, estudo de escrita, temas claro/escuro e os demais recursos da versão anterior continuam incluídos.

## Verificação e limites

Passaram **136 testes JavaScript e 137 testes Python** no Windows. No navegador, duas instâncias independentes trocaram notas, links e blocos hierárquicos automaticamente nos dois sentidos, conservaram dados após reiniciar e preservaram duas edições concorrentes até uma escolha explícita. Os testes também verificam transferência de anexos, retomada após desconexão e proteção durante a digitação. O tamanho do texto foi conferido nos temas claro e escuro, após reabrir a página, entre janelas e a 200% em telas larga e estreita.

A transferência com uma conta Proton real ainda precisa ser validada na instalação do usuário; a instalação em Arch Linux real não foi executada neste ambiente.

O Trama é inspirado no Roam Research e mantém uma tabela explícita de cobertura em `FEATURE-COVERAGE.md`. Não reproduz todo o Roam, seu sistema de colaboração, aplicativos móveis, catálogo Depot ou API completa. Não é um produto oficial do Roam Research.
