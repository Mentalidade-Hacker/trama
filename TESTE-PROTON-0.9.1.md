# Validação real do Proton: Trama 0.9.1 no Windows ↔ Arch Linux

Este é um roteiro para executar, não um resultado de teste. **A transferência em uma conta Proton real e a execução em um Arch Linux real ainda não foram verificadas neste ambiente.** Os testes automatizados locais usam transporte controlado; não demonstram compatibilidade com uma sessão real, o cofre de credenciais do Linux ou a rede da Proton.

Consulte [PROTON-DRIVE.md](PROTON-DRIVE.md) para instalar a CLI oficial. Não é necessário usar comandos de transferência durante este roteiro: os controles do Trama cuidam do modo automático.

## Roteiro curto: sete passos

1. **Prepare e entre:** guarde um backup das notas reais, abra grafos de teste vazios no Windows e no Arch e entre na mesma conta Proton. Configure **Proton direto**, a mesma pasta remota exclusiva e **Sincronização automática**.
2. **Teste as duas direções:** escreva uma nota com filho e link no Windows; confira no Arch. Faça outra nota no Arch e confira no Windows.
3. **Confira um anexo:** transfira um arquivo de 15 MiB; baixe no outro computador e compare tamanho e SHA-256.
4. **Desconecte e volte:** fique sem internet, escreva uma nota e reconecte. Use **Verificar agora**; confira a preservação local e a chegada ao outro computador.
5. **Provoque um conflito controlado:** edite o mesmo bloco nas duas máquinas desconectadas. Reconecte, guarde backups, compare as alternativas e escolha uma. Confira que ambas as versões foram preservadas.
6. **Teste autenticação novamente:** se possível, revogue a sessão de teste identificada nos controles oficiais ou observe uma expiração real. Confira o aviso e use **Entrar no Proton** para retomar. Registre separadamente simulação ou caso não executado.
7. **Reinicie e registre:** encerre durante uma transferência, reabra a mesma pasta de dados e confira a retomada e o SHA-256. Anote aprovação/falha/não executado para cada passo, versões e mensagens observadas.

Os detalhes abaixo explicam a preparação e os critérios de aprovação.

## Preparar um teste separado

1. No Trama que contém suas notas reais, abra **Dados e backups → Backup completo e restauração guiada → Baixar backup completo**. Confira o download. Não use esse grafo no teste.
2. Feche o Trama antes de iniciar uma instância de teste no mesmo computador. Na pasta do aplicativo, abra um banco descartável em uma pasta nova. Por exemplo:

   Windows, PowerShell:

   ```powershell
   py -3 server.py --data-dir "$env:TEMP\trama-validacao-091" --port 8789
   ```

   Arch Linux:

   ```bash
   python server.py --data-dir "$HOME/trama-validacao-091" --port 8789
   ```

   Use uma pasta ainda inexistente em cada máquina. Confirme que o grafo está vazio. Não aponte para a pasta das suas notas reais.

3. Pelo site do Proton Drive, crie uma pasta remota exclusiva, por exemplo `Trama-validacao-091`, em **My files**. A pasta remota será `/my-files/Trama-validacao-091` nos dois computadores.
4. Em **Sincronização → Ajustar conexão e modo automático**, selecione **Proton direto**, informe o executável oficial se necessário, dê nomes diferentes aos computadores e clique **Entrar no Proton**. Conclua o login oficial em ambos. No Arch, verifique também a disponibilidade do serviço de segredos exigido pela CLI.
5. Informe a mesma pasta remota, deixe a pasta local vazia para o Trama prepará-la, marque **Sincronização automática** e use **Salvar configuração**. Os dois grafos devem estar vazios inicialmente.
6. Anote versões do Trama, Python, sistema operacional e CLI; transporte escolhido e data/hora. Registre resultados e mensagens, sem incluir tokens, senhas, URLs de autenticação ou dados pessoais.

## Executar e registrar

| Caso | Ação | Critério para aprovar |
| --- | --- | --- |
| Login e primeira conexão | Use **Verificar agora** em cada máquina. Observe o painel e conclua qualquer pedido de login oficial. | Não aparece confirmação de envio baseada apenas em encontrar o executável. A verificação remota termina ou apresenta uma falha clara. |
| Windows → Arch | No Windows, crie uma página `Teste Windows`, um bloco com texto único, um filho e `[[Teste Arch]]`. Espere a gravação e deixe o Arch sem edição. | Página, hierarquia e link aparecem no Arch após a transferência. Registre os horários reais de envio, download e aplicação; não exija chegada instantânea. |
| Arch → Windows | No Arch, abra `Teste Arch`, escreva um texto único e um filho. Espere o Windows receber. | Conteúdo e backlink aparecem no Windows; o painel distingue verificação, envio e recebimento. |
| Anexo de 15 MiB | Crie um arquivo descartável de 15.728.640 bytes, anexe-o pelo menu **Arquivos** ou `/upload`, espere a transferência e baixe o anexo no outro computador. | O download tem o mesmo tamanho e SHA-256 do original. Não basta ver o nome do anexo. Repita na direção contrária se os dois sistemas usam configurações diferentes. |
| Sem internet e volta | Desconecte a rede de uma máquina de teste; escreva e salve uma nota. Aguarde uma tentativa de transporte, depois reconecte e use **Verificar agora**. | A nota continua local durante a falha; o painel mostra pendência/erro, sem afirmar envio. Ao voltar a rede, a transferência retoma sem duplicar ou apagar notas. |
| Alterações concorrentes | Com ambos na mesma versão, desconecte as redes. Edite o mesmo bloco de formas diferentes e salve nas duas máquinas. Reconecte ambas. | As duas cópias ficam preservadas e surge conflito. Não há escolha silenciosa pela data nem combinação automática dos textos. |
| Resolver o conflito | Em cada máquina, guarde um backup completo. Use **Comparar e escolher**, confira os trechos e só então **Preservar cópia local e receber** para a alternativa escolhida. | A versão escolhida chega aos dois computadores. A alternativa anterior permanece recuperável; confira as cópias preservadas antes de considerar o caso aprovado. |
| Reiniciar e retomar | Crie uma alteração e encerre o servidor Trama durante uma transferência. Reabra usando exatamente a mesma pasta de dados de teste; use **Verificar agora**. | O processo retoma ou repete a tentativa com segurança. O anexo mantém seu SHA-256; não há confirmação falsa, arquivo truncado aceito ou perda da nota local. |
| Login necessário novamente | Se a conta permitir identificar e revogar especificamente a sessão da CLI usada no teste, faça isso nos controles oficiais. Alternativamente, aguarde uma expiração real verificável. Faça uma alteração e tente transferir; use **Entrar no Proton** para reconectar. | A falha pede nova autenticação e preserva os dados. Depois do login, a transferência retoma. Registre se foi **revogação real**, **expiração real**, **simulação** ou **não executado**. Uma queda de rede ou erro simulado não comprova expiração de sessão. |

Para gerar um anexo de teste que não se comprima a poucos bytes, execute na pasta onde deseja guardar o arquivo:

```bash
python -c "from pathlib import Path; import os; Path('trama-teste-15MiB.bin').write_bytes(os.urandom(15*1024*1024))"
```

No Windows, substitua `python` por `py -3` se esse for o iniciador instalado. Para conferir o original e o arquivo baixado, execute em cada computador, ajustando o nome:

```bash
python -c "from pathlib import Path; import hashlib; p=Path('trama-teste-15MiB.bin'); print(p.stat().st_size, hashlib.sha256(p.read_bytes()).hexdigest())"
```

## Registrar o resultado sem extrapolar

- Marque cada caso como **aprovado**, **falhou** ou **não executado**, com o que foi observado e a duração aproximada.
- Registre se a sessão precisou de nova autenticação após fechar/reabrir o servidor e depois de reiniciar o sistema operacional.
- Se usou **Pasta já sincronizada**, registre isso separadamente: o Trama confirma a pasta local; o aplicativo Proton é responsável pela nuvem. Esse resultado não valida **Proton direto** no Arch.
- Guarde os backups e arquivos de teste até conferir os resultados. A pasta remota guarda versões completas e não é limpa automaticamente. O roteiro não pede remoção de arquivos da conta.
- Não transforme casos simulados em evidência de funcionamento real. Uma aprovação vale para as versões e condições anotadas, não para todas as contas, redes ou instalações.
