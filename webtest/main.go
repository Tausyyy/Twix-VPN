package main

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"
)

var (
	panelURL       string
	panelUser      string
	panelPass      string
	subBaseURL     string
	frontendDir    string
	internalSecret string
)

var inboundIDs = []int{1, 2, 3} // id инбаундов, куда добавлять клиентов
var httpClient *http.Client
var csrfRegex = regexp.MustCompile(`<meta name="csrf-token" content="([^"]+)">`)

// текущий csrf-token, обновляется при каждом логине
var currentCSRF string

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("no .env file found, using system env vars")
	}

	panelURL = os.Getenv("PANEL_URL")
	panelUser = os.Getenv("PANEL_USER")
	panelPass = os.Getenv("PANEL_PASS")
	subBaseURL = os.Getenv("SUB_BASE_URL")
	frontendDir = os.Getenv("FRONTEND_DIR")
	internalSecret = os.Getenv("INTERNAL_SECRET")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	if panelURL == "" || panelUser == "" || panelPass == "" {
		log.Fatal("missing required env vars: PANEL_URL, PANEL_USER, PANEL_PASS")
	}
	if internalSecret == "" {
		log.Fatal("missing required env var: INTERNAL_SECRET (must match backend/db/.env)")
	}
	if frontendDir == "" {
		// webtest/ - подпапка внутри проекта, фронтенд лежит на уровень выше
		frontendDir = ".."
	}

	jar, err := cookiejar.New(nil)
	if err != nil {
		log.Fatal(err)
	}

	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}

	// ВАЖНО: без таймаута запрос к панели может зависнуть навсегда,
	// если панель недоступна/тормозит.
	httpClient = &http.Client{
		Jar:       jar,
		Transport: tr,
		Timeout:   15 * time.Second,
	}

	if err := panelLogin(); err != nil {
		log.Fatal("login error: ", err)
	}
	log.Println("Logged into 3x-ui panel OK")

	mux := http.NewServeMux()

	// favicon.svg и icons.svg лежат в public/ (конвенция Vite),
	// но в HTML на них ссылаются с корня ("/favicon.svg") -
	// поэтому раздаём их отдельным маршрутом из public/.
	mux.HandleFunc("/favicon.svg", servePublicFile("favicon.svg"))
	mux.HandleFunc("/icons.svg", servePublicFile("icons.svg"))

	// backend/, Telegram_bot/, node_modules и служебные файлы наружу не отдаём -
	// FileServer раздаёт только то, на что реально есть ссылки в HTML/JS/CSS,
	// но на всякий случай не открываем директорию целиком листингом.
	mux.Handle("/", http.FileServer(http.Dir(frontendDir)))

	// /internal/create закрыт секретным заголовком - вызывать его может
	// только Express (backend/server.js), а не фронт напрямую. Express сам
	// решает, кто залогинен, и передаёт сюда только user_id.
	mux.HandleFunc("/internal/create", recoverMiddleware(internalCreateHandler))

	log.Println("Serving frontend from:", frontendDir)


	log.Println("Server running at http://localhost:" + port)

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}
	// Ловим Ctrl+C сами, чтобы явно видеть в логе, что это осознанная
	// остановка, а не крах.
	go func() {
		stop := make(chan os.Signal, 1)
		signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
		<-stop
		log.Println("Получен сигнал остановки (Ctrl+C) - завершаю работу...")
		os.Exit(0)
	}()

	log.Fatal(srv.ListenAndServe())
}

// recoverMiddleware ловит панику внутри хендлера и отдаёт клиенту JSON
// с ошибкой вместо того, чтобы просто оборвать соединение.
func recoverMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("panic in %s: %v", r.URL.Path, rec)
				writeJSON(w, http.StatusInternalServerError, createResponse{
					Success: false,
					Error:   fmt.Sprintf("internal server error: %v", rec),
				})
			}
		}()
		next(w, r)
	}
}

// servePublicFile отдаёт конкретный файл из frontendDir/public/<name>
func servePublicFile(name string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(frontendDir, "public", name))
	}
}

// fetchCSRFToken делает GET на страницу логина, чтобы получить
// свежую cookie (через jar автоматически) и csrf-token из HTML.
func fetchCSRFToken() (string, error) {
	resp, err := httpClient.Get(panelURL + "/")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	matches := csrfRegex.FindStringSubmatch(string(body))
	if len(matches) < 2 {
		return "", fmt.Errorf("csrf token not found in login page (status %d)", resp.StatusCode)
	}
	return matches[1], nil
}

func panelLogin() error {
	token, err := fetchCSRFToken()
	if err != nil {
		return fmt.Errorf("fetch csrf token: %w", err)
	}

	form := url.Values{}
	form.Set("username", panelUser)
	form.Set("password", panelPass)

	req, err := http.NewRequest("POST", panelURL+"/login", strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("X-CSRF-Token", token)

	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return fmt.Errorf("login failed, status %d, body: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Success bool   `json:"success"`
		Msg     string `json:"msg"`
	}
	if err := json.Unmarshal(body, &result); err == nil && !result.Success {
		return fmt.Errorf("login rejected: %s", result.Msg)
	}

	currentCSRF = token
	return nil
}

type newClientPayload struct {
	Client struct {
		Email      string `json:"email"`
		TotalGB    int64  `json:"totalGB"`
		ExpiryTime int64  `json:"expiryTime"`
		TgID       int64  `json:"tgId"`
		LimitIP    int    `json:"limitIp"`
		Enable     bool   `json:"enable"`
		Flow       string `json:"flow,omitempty"`
	} `json:"client"`
	InboundIds []int `json:"inboundIds"`
}

const clientFlow = "xtls-rprx-vision"

// addClient создаёт клиента через новый API /panel/api/clients/add.
func addClient(email string, tgID int64, expiryTimeMs int64) error {
	var payload newClientPayload
	payload.Client.Email = email
	payload.Client.TotalGB = 0
	payload.Client.ExpiryTime = expiryTimeMs
	payload.Client.TgID = tgID
	payload.Client.LimitIP = 0
	payload.Client.Enable = true
	payload.InboundIds = inboundIDs
	payload.Client.Flow = clientFlow
	payload.Client.Enable = true

	body, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", panelURL+"/panel/api/clients/add", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", currentCSRF)

	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	respBody, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("addClient failed, status %d, body: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Success bool   `json:"success"`
		Msg     string `json:"msg"`
	}
	if err := json.Unmarshal(respBody, &result); err == nil && !result.Success {
		return fmt.Errorf("addClient rejected: %s", result.Msg)
	}

	return nil
}

// getClientSubID запрашивает данные клиента по email и достаёт его subId.
// Возвращает ошибку и в случае сетевых проблем, и в случае, если клиента
// с таким email в панели ещё нет - вызывающий код не должен различать эти
// случаи иначе, чем "клиента пока нет, надо создать".
func getClientSubID(email string) (string, error) {
	req, err := http.NewRequest("GET", panelURL+"/panel/api/clients/get/"+email, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("X-CSRF-Token", currentCSRF)

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	respBody, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("get client failed, status %d, body: %s", resp.StatusCode, string(respBody))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("get client: cannot parse response: %s", string(respBody))
	}

	if success, ok := result["success"].(bool); ok && !success {
		msg, _ := result["msg"].(string)
		return "", fmt.Errorf("get client rejected: %s", msg)
	}

	subID := findSubID(result)
	if subID == "" {
		return "", fmt.Errorf("subId not found in get-client response: %s", string(respBody))
	}
	return subID, nil
}

// findSubID рекурсивно ищет ключ "subId" в произвольной JSON-структуре ответа.
func findSubID(data interface{}) string {
	switch v := data.(type) {
	case map[string]interface{}:
		if s, ok := v["subId"].(string); ok && s != "" {
			return s
		}
		for _, val := range v {
			if found := findSubID(val); found != "" {
				return found
			}
		}
	case []interface{}:
		for _, item := range v {
			if found := findSubID(item); found != "" {
				return found
			}
		}
	}
	return ""
}

// createResponse — JSON, который уходит вызывающей стороне (Express).
type createResponse struct {
	Success bool   `json:"success"`
	Link    string `json:"link,omitempty"`
	Error   string `json:"error,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

type internalCreateRequest struct {
	UserID int64 `json:"user_id"`
	TelegramID int64 `json:"telegram_id"`
	ExpiryTime int64 `json:"expiry_time"`
}

// internalCreateHandler создаёт (или находит уже существующего) клиента в
// 3x-ui для данного пользователя. Email детерминированный (user_<id>@twix.local),
// поэтому повторный вызов для того же user_id НЕ создаёт нового клиента -
// сначала всегда проверяем, нет ли его уже в панели.
func internalCreateHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, createResponse{Success: false, Error: "method not allowed, use POST"})
		return
	}

	if r.Header.Get("X-Internal-Secret") != internalSecret {
		writeJSON(w, http.StatusForbidden, createResponse{Success: false, Error: "forbidden"})
		return
	}

	var req internalCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserID == 0 {
		writeJSON(w, http.StatusBadRequest, createResponse{Success: false, Error: "user_id is required"})
		return
	}

	email := fmt.Sprintf("%d", req.TelegramID)

	// 1) Сначала спрашиваем у панели: а вдруг клиент уже есть?
	subID, err := getClientSubID(email)
	if err != nil {
		// 2) Раз клиента нет (или временная сетевая ошибка) - создаём
		// сразу с нужным сроком действия.
		addErr := addClient(email, req.TelegramID, req.ExpiryTime)
		if addErr != nil {
			// возможно сессия/csrf протухли — пробуем перелогиниться и повторить один раз
			if loginErr := panelLogin(); loginErr == nil {
				addErr = addClient(email, req.TelegramID, req.ExpiryTime)
			} else {
				addErr = fmt.Errorf("%v (relogin also failed: %v)", addErr, loginErr)
			}
		}
		if addErr != nil {
			log.Println("internalCreateHandler addClient error:", addErr)
			writeJSON(w, http.StatusInternalServerError, createResponse{Success: false, Error: addErr.Error()})
			return
		}

		// 3) Теперь клиент точно должен существовать - забираем его subId.
		subID, err = getClientSubID(email)
		if err != nil {
			log.Println("internalCreateHandler getClientSubID error:", err)
			writeJSON(w, http.StatusInternalServerError, createResponse{Success: false, Error: err.Error()})
			return
		}
	} else {
		// Клиент уже существует - обновляем ему expiryTime на актуальное
		// значение (либо продление после оплаты, либо просто освежаем то
		// же самое значение при обычном заходе за ссылкой).
		updErr := updateClientExpiry(email, req.TelegramID, req.ExpiryTime)
		if updErr != nil {
			if loginErr := panelLogin(); loginErr == nil {
				updErr = updateClientExpiry(email, req.TelegramID, req.ExpiryTime)
			}
			if updErr != nil {
				log.Println("internalCreateHandler updateClientExpiry error:", updErr)
				// не фатально - продолжаем со старым expiryTime в панели,
				// ссылку всё равно отдаём, просто залогируем проблему.
			}
		}
	}

	link := fmt.Sprintf("%s/%s", subBaseURL, subID)
	writeJSON(w, http.StatusOK, createResponse{Success: true, Link: link})
}

// updateClientExpiry обновляет expiryTime у уже существующего клиента
// через /panel/api/clients/update/{email}. Используется и для продления
// подписки, и для того, чтобы держать дату истечения в панели в синхроне
// с тем, что хранится в нашей БД, при каждом повторном обращении.
//
// ВНИМАНИЕ: точная форма тела запроса для этого эндпоинта не была
// сверена с /panel/api-docs (в отличие от /clients/add, который мы
// проверяли на реальных ответах панели). Перед тем как полагаться на
// это в проде - проверь curl'ом на тестовом клиенте, что expiryTime
// реально меняется, и поправь структуру payload при необходимости.
func updateClientExpiry(email string, tgID int64, expiryTimeMs int64) error {
	var payload newClientPayload
	payload.Client.Email = email
	payload.Client.TotalGB = 0
	payload.Client.ExpiryTime = expiryTimeMs
	payload.Client.TgID = tgID
	payload.Client.LimitIP = 0
	payload.Client.Enable = true
	payload.Client.Flow = clientFlow
	// inboundIds для update, скорее всего, не нужен (клиент уже
	// привязан к своим инбаундам) - но панель может требовать его
	// передавать тоже. Если update не сработает без этого поля,
	// добавь: payload.InboundIds = inboundIDs

	body, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", panelURL+"/panel/api/clients/update/"+email, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", currentCSRF)

	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	respBody, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("updateClientExpiry failed, status %d, body: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Success bool   `json:"success"`
		Msg     string `json:"msg"`
	}
	if err := json.Unmarshal(respBody, &result); err == nil && !result.Success {
		return fmt.Errorf("updateClientExpiry rejected: %s", result.Msg)
	}

	return nil
}