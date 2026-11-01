# Backup completo e restauração guiada — Trama 0.9

## Criar uma cópia

1. Abra **Dados e backups → Backup completo e restauração guiada**.
2. Clique **Baixar backup completo**. O Trama aguarda a gravação das notas e dos rascunhos desta janela.
3. Confira se o ZIP terminou de baixar e guarde-o em um local privado. Ele contém suas notas e não tem senha ou criptografia própria.

O arquivo inclui o grafo, os anexos registrados, o histórico ainda disponível (até 100 revisões), rascunhos de **Aprender a escrever**, aparência, tamanho do texto, idioma, correção ao digitar, dicas de vocabulário, palavras aceitas, favoritos e páginas recentes deste navegador.

O arquivo não inclui senhas/tokens de configuração, sessão do Proton, identidade de outro dispositivo, caminhos locais, executável da CLI, dicionário, Java, LanguageTool ou modelos de tradução. Os motores e modelos podem ser instalados novamente no destino. Conteúdo privado que você mesmo escreveu nas notas continua sendo parte das notas; o backup não é um detector de segredos dentro de texto.

Limites: 256 MB de conteúdo expandido, ZIP de até 260 MB, 5.000 anexos e 20 MB por anexo. Não há omissão silenciosa: se o conjunto exceder os limites ou faltar um anexo, a operação informa o problema. As cópias SQLite antigas e a pasta de snapshots do Proton não são empacotadas recursivamente.

## Restaurar no Windows ou Linux

1. Instale o Trama 0.9.1, abra o aplicativo e entre em **Dados e backups → Backup completo e restauração guiada**.
2. Escolha o ZIP em **Arquivo de backup completo**. A inspeção ainda não substitui nada.
3. Confira data, páginas, blocos, anexos, revisões e rascunhos. Escolha se deseja aplicar as preferências do navegador.
4. Confirme a restauração. O Trama guarda primeiro um ZIP do estado atual em `full-backups`, ao lado do banco. Normalmente a janela recarrega. Se o navegador impedir guardar o aviso de conclusão, o Trama mantém o link da cópia anterior visível; baixe-o se desejar e clique em **Atualizar e abrir notas restauradas**.
5. Confira notas, anexos e rascunhos. O aviso de conclusão oferece **Baixar a cópia anterior**. Se precisar voltar, restaure essa cópia pelo mesmo assistente.
6. Só depois configure novamente o Proton. A restauração deixa a sincronização desligada e desconectada para que outra máquina não substitua imediatamente o conteúdo restaurado.

Se o estado mudar entre a inspeção e a confirmação, inspecione novamente. O aplicativo confere hashes, formato, nomes e tamanhos antes de aplicar; rejeita arquivos incompletos ou caminhos indevidos. Uma cópia de recuperação e um registro local ajudam a conciliar banco e configurações após interrupções. Isso não substitui uma cópia externa contra falha física do disco.

O histórico conserva os conteúdos e sua ordem; os números de revisão são ajustados ao banco de destino. Rascunhos do navegador anteriores à restauração ficam separados e só são recuperados por escolha explícita em **Retomar um rascunho → Cópia anterior**.

O ZIP inclui rascunhos gravados no banco, inclusive os exercícios de tradução da 0.9.1. Cópias anteriores que estão somente no navegador ficam fora: use **Conferir rascunhos de estudo**, recupere as desejadas e salve antes de exportar. Duplicatas podem ser ignoradas.

Na 0.9.1, o registro que permite recuperar uma restauração interrompida é publicado por troca atômica de arquivo. Uma interrupção antes da troca deixa apenas um temporário ignorado na abertura. Isso evita novos registros parciais; um registro já truncado pela 0.9 continua exigindo análise manual, preservando a cópia anterior e os dados.

## Outros formatos continuam disponíveis

- **Exportar JSON/Markdown/Roam**: transporte das notas; não equivale ao backup completo.
- **Exportar grafo completo + anexos**: cofre ZIP antigo, mantido para compatibilidade e sincronização; não inclui todas as preferências, histórico e rascunhos.
- **Backup SQLite**: cópia do banco; não duplica os arquivos anexos.

O novo assistente reconhece o formato completo da 0.9. Para um cofre antigo, use **Restaurar grafo completo**, preservado em Dados e backups.
