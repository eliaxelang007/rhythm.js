import typescript from '@rollup/plugin-typescript';

export default {
    input: 'src/soundtrack.ts',
    output: [
        {
            file: 'dist/soundtrack.js',
            format: 'umd',
            name: "Soundtrack"
        },
        {
            file: 'dist/soundtrack.esm.js',
            format: 'esm',
        }
    ],
    plugins: [typescript({ tsconfig: "./tsconfig.json" })],
};
