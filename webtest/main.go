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
	"path/filepath"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/joho/godotenv"
)

var (
	panelURL    string
	panelUser   string
	panelPass   string
	subBaseURL  string
	frontendDir string
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

	if panelURL == "" || panelUser == "" || panelPass == "" {
		log.Fatal("missing required env vars: PANEL_URL, PANEL_USER, PANEL_PASS")
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
	httpClient = &http.Client{Jar: jar, Transport: tr}

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

	mux.HandleFunc("/create", createHandler)

	log.Println("Serving frontend from:", frontendDir)
	log.Println("Server running at http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
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
	} `json:"client"`
	InboundIds []int `json:"inboundIds"`
}

// addClient создаёт клиента через новый API /panel/api/clients/add.
func addClient(email string, tgID int64) error {
	var payload newClientPayload
	payload.Client.Email = email
	payload.Client.TotalGB = 0
	payload.Client.ExpiryTime = 0
	payload.Client.TgID = tgID
	payload.Client.LimitIP = 0
	payload.Client.Enable = true
	payload.InboundIds = inboundIDs

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

// createResponse — JSON, который уходит на фронт.
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

func createHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, createResponse{Success: false, Error: "method not allowed, use POST"})
		return
	}

	email := fmt.Sprintf("user_%s", uuid.New().String()[:8])
	var tgID int64 = 0 // тут потом будет реальный telegram id пользователя

	err := addClient(email, tgID)
	if err != nil {
		// возможно сессия/csrf протухли — пробуем перелогиниться и повторить один раз
		if loginErr := panelLogin(); loginErr == nil {
			err = addClient(email, tgID)
		} else {
			err = fmt.Errorf("%v (relogin also failed: %v)", err, loginErr)
		}
	}

	if err != nil {
		log.Println("createHandler addClient error:", err)
		writeJSON(w, http.StatusInternalServerError, createResponse{Success: false, Error: err.Error()})
		return
	}

	subID, err := getClientSubID(email)
	if err != nil {
		log.Println("createHandler getClientSubID error:", err)
		writeJSON(w, http.StatusInternalServerError, createResponse{Success: false, Error: err.Error()})
		return
	}

	link := fmt.Sprintf("%s/%s", subBaseURL, subID)
	writeJSON(w, http.StatusOK, createResponse{Success: true, Link: link})
}