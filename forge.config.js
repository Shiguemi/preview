const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: "Preview",
        authors: "Leonardo Dinnouti",
        description: "Simple image previewer",
        setupIcon: "static/preview_icon.ico"
      },
    },
    // {
    //   name: '@electron-forge/maker-wix',
    //   config: {
    //     // --- Configurações do Instalador MSI ---
        
    //     // Nome do produto
    //     name: "Preview",

    //     // Fabricante (sua empresa)
    //     manufacturer: 'Leonardo Dinnouti',
        
    //     // Descrição
    //     description: 'Simple image previewer.',
        
    //     // (Obrigatório) Um GUID para o seu produto. Gere um novo para cada projeto.
    //     // Você pode usar um gerador online de GUIDs.
    //     appId: '0f0fb594-f383-426d-a158-2a5cbd8538ea',

    //     // (Obrigatório) Um GUID para o código de atualização. Deve ser o mesmo entre versões.
    //     upgradeCode: 'b71de85c-412b-4ed0-be08-4fe67fbfb84e',

    //     // (Opcional) UI do instalador
    //     ui: {
    //       chooseDirectory: true, // Permite ao usuário escolher o diretório de instalação
    //     },

    //     // Ícone do instalador
    //     setupIcon: 'static/preview_icon.ico',
    //   },
    // },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
      config: {
        name: "Preview",
        authors: "Leonardo Dinnouti",
        description: "Simple image previewer",
        setupIcon: "static/preview_icon.ico"
      },
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          maintainer: 'Leonardo Shiguemi Dinnouti',
          homepage: '',
          // Other deb-specific options like icon, category, etc.
        }        
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
