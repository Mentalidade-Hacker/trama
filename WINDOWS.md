# Trama no Windows

O instalador da **0.10.2 inclui o programa, o dicionário offline e um Python privado**. Você não precisa instalar Python, abrir um terminal ou compilar arquivos para usar o Trama.

## Baixar e instalar

1. Baixe [Trama 0.10.2 para Windows](https://github.com/Mentalidade-Hacker/trama/releases/download/v0.10.2/trama-v0.10.2-windows-setup.exe) na publicação oficial. O arquivo termina em **windows-setup.exe**.
2. Abra o arquivo com dois cliques e siga as telas. O instalador atende Windows 10 ou mais recente de 64 bits e instala para o seu usuário.
3. Mantenha a pasta sugerida, a menos que tenha uma necessidade específica. Se já usa o Trama, salve, faça um backup e encerre o aplicativo antes de continuar.
4. Se quiser, marque **Criar atalho na área de trabalho**. A opção **Criar atalhos para configurar gramática e tradução** acrescenta os assistentes opcionais ao menu Iniciar.
5. Ao terminar, abra **Trama** no menu Iniciar ou pelo atalho criado.

A janela usa Edge ou Chrome quando disponíveis; caso contrário, abre no navegador padrão. O iniciador e o servidor não precisam de uma janela de terminal. O endereço é local, neste computador; abrir o aplicativo não publica suas notas na internet.

O instalador e o iniciador ainda **não têm assinatura digital de um certificado do Trama**. Os arquivos oficiais e seus [hashes SHA-256](https://github.com/Mentalidade-Hacker/trama/releases/download/v0.10.2/trama-v0.10.2-SHA256.txt) estão na mesma publicação. Um alerta ou bloqueio do Windows não deve ser tratado como motivo para desativar suas proteções; confira a origem e a publicação antes de decidir como prosseguir.

## Abrir, guardar e encerrar

O Trama salva as notas automaticamente. Antes de sair, confira o indicador de salvamento e as outras janelas abertas.

- **Abrir novamente:** use o atalho ou o ícone do Trama na bandeja, perto do relógio. Abrir o mesmo atalho não cria outro servidor da mesma instalação.
- **Encerrar:** clique em **Encerrar Trama** na barra lateral ou escolha **Salvar e encerrar…** no menu do ícone da bandeja. Confirme na interface; ela salva as notas e os rascunhos desta janela antes de encerrar.
- **Se houver um conflito ou outra janela editando:** resolva e confira o salvamento nessa janela antes de tentar encerrar novamente.

Fechar apenas a janela de leitura não encerra o Trama. Ele continua disponível pela bandeja. Quando o encerramento for confirmado, abra novamente pelo mesmo atalho para retomar o uso ou aplicar uma atualização já preparada.

## O que já vem pronto

Notas, blocos hierárquicos, links, referências, busca, histórico, anexos e exercícios de aprendizagem funcionam com os recursos locais incluídos. A correção **ortográfica** em português e inglês e o **dicionário de significados** também já estão disponíveis.

| Recurso opcional | Como preparar |
| --- | --- |
| Gramática em português e inglês | Abra **Configurar gramática** no menu Iniciar. O assistente baixa LanguageTool e Java quando necessário. |
| Tradução local português ↔ inglês | Abra **Configurar tradução** no menu Iniciar. O assistente baixa o motor e os modelos. |
| Sincronização Proton Drive | Configure separadamente conforme [PROTON-DRIVE.md](PROTON-DRIVE.md). Uma conta e o aplicativo/CLI oficial são necessários no modo escolhido. |

Os assistentes de gramática e tradução usam o Python incluído e mostram o andamento em uma janela própria. Mantenha a conexão durante o download e espere a mensagem de conclusão. As análises e traduções posteriores são locais. Se os atalhos opcionais não foram criados, encerre o Trama, abra o instalador novamente e marque a opção correspondente. Consulte [WRITING.md](WRITING.md) e [TRANSLATION.md](TRANSLATION.md) para os detalhes de cada motor.

Os atalhos opcionais usam internamente os modos `--setup-writing` e `--setup-translation` do `Trama.exe`; o uso normal não exige digitar esses parâmetros. O instalador inclui CPython **3.14.10**, obtido da distribuição oficial NuGet, com os arquivos e a licença dessa distribuição.

## Atualizar e preservar as notas

O painel **Atualizações** baixa novas versões do código do aplicativo. Quando estiverem prontas, salve, encerre e abra novamente. **O download automático não substitui o `Trama.exe` nem o Python privado.** Para atualizar esses componentes, use um instalador EXE mais recente no mesmo destino. O procedimento completo está em [UPDATES.md](UPDATES.md).

Se você usava o ZIP da 0.10 ou uma versão anterior, executar este instalador uma vez é necessário para obter o iniciador nativo. A atualização automática de código não cria esse iniciador. A instalação padrão reutiliza o local de notas já reconhecido pelo Trama; se você usava uma pasta personalizada, preserve-a e mantenha sua configuração. Faça um **Backup completo** antes de mudar a forma de instalação.

Na instalação padrão, os arquivos do programa ficam em `app`, o Python privado em `runtime` e as notas em `%LOCALAPPDATA%/Trama/data`, salvo um local anterior ou personalizado. A configuração de sincronização, os rascunhos, os modelos já instalados e os backups não são substituídos pelo pacote de código. Os logs do iniciador ficam em `data/launcher-logs`.

O instalador exige que o aplicativo e seus assistentes estejam encerrados antes de substituir arquivos. Se houver conteúdo pessoal desconhecido dentro da área do programa, ele pede outro destino ou que esse conteúdo seja preservado antes de continuar. Não mova `runtime` depois de configurar a tradução; o ambiente instalado pode depender daquele caminho.

Desinstalar o Trama remove os arquivos registrados do programa e seus atalhos, **preservando as notas e os dados que não foram instalados pelo pacote**, inclusive o estado de atualizações. Isso não substitui um backup: exporte e guarde uma cópia dos dados importantes antes de reinstalar ou desinstalar.

## Conferências essenciais

Este é um roteiro para o equipamento onde o aplicativo será usado, não uma afirmação de que todos os passos já foram executados:

1. Abra pelo menu Iniciar, crie uma nota com um bloco filho, escreva um rascunho e acrescente um anexo. Encerre pela interface, reabra e confira os três.
2. Abra o atalho outra vez com o Trama em execução. Confira que a janela abre e suas notas continuam as mesmas.
3. Consulte uma palavra em português e outra em inglês no dicionário sem conexão. Confira também os avisos ortográficos ao escrever.
4. Se precisar de gramática ou tradução, execute o assistente correspondente e confira uma frase real após a instalação.
5. Aplique uma atualização de código e, separadamente, reinstale o EXE no mesmo destino. Confira notas, anexo, rascunho e configuração de sincronização depois de cada operação.

O iniciador passou por **30 verificações locais reproduzíveis** de compilação, argumentos, travas e assistentes. Elas não representam uma instalação gráfica completa em todos os computadores. A execução em Arch gráfico real e a transferência com uma **conta Proton real entre Windows e Arch** continuam separadas dessa verificação. Consulte [RELEASE-v0.10.2.md](RELEASE-v0.10.2.md) e o [checklist Proton](TESTE-PROTON-0.10.md).
