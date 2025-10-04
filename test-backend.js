/**
 * Script de teste do backend Python
 * Execute com: node test-backend.js
 */

const pythonManager = require('./python-manager');

async function test() {
    console.log('=== Teste do Backend Python ===\n');

    try {
        console.log('1. Inicializando Python Manager...');
        await pythonManager.initialize();
        console.log('✓ Python Manager inicializado com sucesso!\n');

        console.log('2. Verificando status...');
        console.log(`   - Backend pronto: ${pythonManager.isReady}`);
        console.log(`   - URL: ${pythonManager.backendUrl}`);
        console.log(`   - Executável Python: ${pythonManager.pythonExecutable}\n`);

        console.log('3. Testando health check...');
        const healthOk = await pythonManager.checkBackendHealth();
        console.log(`✓ Health check: ${healthOk ? 'OK' : 'FALHOU'}\n`);

        // Se você tiver um arquivo EXR de teste, descomente e ajuste o caminho abaixo:
        /*
        console.log('4. Testando conversão EXR...');
        const testFile = '/caminho/para/seu/arquivo.exr';
        const result = await pythonManager.convertExr(testFile, 800, 2.2);
        if (result) {
            console.log('✓ Conversão EXR bem-sucedida!');
            console.log(`   Tamanho do resultado: ${result.length} caracteres\n`);
        } else {
            console.log('✗ Conversão EXR falhou\n');
        }
        */

        console.log('=== Teste Concluído ===');
        console.log('Para testar conversão EXR, descomente a seção no código\n');

    } catch (error) {
        console.error('✗ Erro durante o teste:', error);
        console.error('   Mensagem:', error.message);
        if (error.stack) {
            console.error('   Stack:', error.stack);
        }
    } finally {
        console.log('\nParando backend...');
        await pythonManager.stop();
        console.log('Backend parado.');
        process.exit(0);
    }
}

test();
