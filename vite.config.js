import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [tailwindcss()],
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
			// /create теперь обрабатывает Express (проверяет авторизацию,
			// хранит ссылку в БД) и сам ходит на Go внутренне -
			// фронт больше не бьёт в Go напрямую.
			'/create': { target: 'http://127.0.0.1:3000', changeOrigin: true }
		}
	}
})
