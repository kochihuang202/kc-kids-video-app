package main

import (
	"log"
	"net/http"
	"os"

	"github.com/kochihuang202/kc-kids-video-app/mac-media-server/internal/server"
)

func main() {
	cfg, err := server.ConfigFromEnv()
	if err != nil {
		log.Fatal(err)
	}

	addr := cfg.Host + ":" + cfg.Port
	log.Printf("starting read-only media server on %s", addr)
	log.Fatal(http.ListenAndServe(addr, server.New(cfg)))
}

func init() {
	log.SetFlags(log.LstdFlags | log.LUTC)
	log.SetOutput(os.Stderr)
}
