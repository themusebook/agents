package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	grpcapi "github.com/GustyCube/membrane/api/grpc"
	httpjson "github.com/GustyCube/membrane/api/http"
	"github.com/GustyCube/membrane/pkg/membrane"
)

var version = "dev"

func main() {
	configPath := flag.String("config", "", "path to YAML config file")
	dbPath := flag.String("db", "", "SQLite database path (overrides config)")
	postgresDSN := flag.String("postgres-dsn", "", "PostgreSQL DSN (overrides config and selects the postgres backend)")
	addr := flag.String("addr", "", "gRPC listen address (overrides config)")
	httpAddr := flag.String("http-addr", "", "JSON HTTP listen address (overrides config; empty keeps default :9091)")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Printf("membraned %s\n", version)
		return
	}

	// Load configuration.
	var cfg *membrane.Config
	if *configPath != "" {
		var err error
		cfg, err = membrane.LoadConfig(*configPath)
		if err != nil {
			log.Fatalf("failed to load config: %v", err)
		}
	} else {
		cfg = membrane.DefaultConfig()
	}

	// Apply flag overrides.
	if *dbPath != "" {
		cfg.DBPath = *dbPath
	}
	if *postgresDSN != "" {
		cfg.Backend = "postgres"
		cfg.PostgresDSN = *postgresDSN
	}
	if *addr != "" {
		cfg.ListenAddr = *addr
	}
	if *httpAddr != "" {
		cfg.HTTPAddr = *httpAddr
	}

	// Read API key from environment if not set in config.
	if cfg.APIKey == "" {
		cfg.APIKey = os.Getenv("MEMBRANE_API_KEY")
	}

	// Initialize Membrane.
	m, err := membrane.New(cfg)
	if err != nil {
		log.Fatalf("failed to initialize membrane: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start background schedulers.
	if err := m.Start(ctx); err != nil {
		log.Fatalf("failed to start membrane: %v", err)
	}

	// Create gRPC server.
	srv, err := grpcapi.NewServer(m, cfg)
	if err != nil {
		log.Fatalf("failed to create grpc server: %v", err)
	}

	// Start gRPC server in a goroutine (Start blocks).
	errCh := make(chan error, 2)
	go func() {
		log.Printf("membraned: listening on %s", cfg.ListenAddr)
		errCh <- srv.Start()
	}()

	var httpSrv *httpjson.Server
	if cfg.HTTPAddr != "" && cfg.HTTPAddr != "-" {
		httpSrv = httpjson.NewServer(m, cfg.HTTPAddr, cfg.APIKey)
		go func() {
			errCh <- httpSrv.Start()
		}()
	}

	// Wait for shutdown signal or server error.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(sigCh)

	select {
	case sig := <-sigCh:
		log.Printf("membraned: received signal %v, shutting down", sig)
	case err := <-errCh:
		log.Printf("membraned: grpc server error: %v", err)
	}

	// Graceful shutdown: cancel context first to stop background
	// schedulers, then drain in-flight gRPC requests, then close
	// the database. This ordering prevents panics from gRPC handlers
	// hitting a closed database.
	cancel()
	if httpSrv != nil {
		httpCtx, httpCancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := httpSrv.Stop(httpCtx); err != nil {
			log.Printf("membraned: http shutdown: %v", err)
		}
		httpCancel()
	}
	srv.Stop()
	if err := m.Stop(); err != nil {
		log.Printf("membraned: error during shutdown: %v", err)
	}
	log.Println("membraned: shutdown complete")
}
