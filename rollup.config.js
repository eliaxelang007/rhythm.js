import typescript from '@rollup/plugin-typescript';

export default {
    input: 'src/rhythm.ts',
    output: [
        {
            file: 'dist/rhythm.js',
            format: 'umd',
            name: "Rhythm"
        },
        {
            file: 'dist/rhythm.esm.js',
            format: 'esm',
        }
    ],
    plugins: [typescript({ tsconfig: "./tsconfig.json" })],
};
