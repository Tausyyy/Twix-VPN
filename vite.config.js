import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	plugins: [tailwindcss()],
	build: {
		rollupOptions: {
			input: path.resolve(__dirname, 'src.index.html')
		}
	},
	server: {
		host: true,
		port: 5173,
		proxy: {
			'/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
			'/auth': { target: 'http://127.0.0.1:3000', changeOrigin: true },
			'/login': { target: 'http://127.0.0.1:3000', changeOrigin: true },
			'/register': { target: 'http://127.0.0.1:3000', changeOrigin: true },
			'/me': { target: 'http://127.0.0.1:3000', changeOrigin: true },
			'/logout': { target: 'http://127.0.0.1:3000', changeOrigin: true },
			'/create': { target: 'http://127.0.0.1:3000', changeOrigin: true }
		}
	}
})
