// Package httpjson exposes Membrane as a JSON HTTP API for Node/JS agents.
// gRPC remains the canonical protocol; this listener is the catalog runtime path.
package httpjson

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/GustyCube/membrane/pkg/ingestion"
	"github.com/GustyCube/membrane/pkg/membrane"
	"github.com/GustyCube/membrane/pkg/retrieval"
	"github.com/GustyCube/membrane/pkg/schema"
)

// Server is a JSON HTTP wrapper around Membrane.
type Server struct {
	membrane *membrane.Membrane
	apiKey   string
	http     *http.Server
}

// NewServer builds an HTTP mux for the given Membrane instance.
func NewServer(m *membrane.Membrane, addr, apiKey string) *Server {
	s := &Server{membrane: m, apiKey: apiKey}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.withAuth(s.handleHealth))
	mux.HandleFunc("/metrics", s.withAuth(s.handleMetrics))
	mux.HandleFunc("/v1/ingest/event", s.withAuth(s.handleIngestEvent))
	mux.HandleFunc("/v1/ingest/observation", s.withAuth(s.handleIngestObservation))
	mux.HandleFunc("/v1/ingest/tool", s.withAuth(s.handleIngestTool))
	mux.HandleFunc("/v1/ingest/working", s.withAuth(s.handleIngestWorking))
	mux.HandleFunc("/v1/retrieve", s.withAuth(s.handleRetrieve))
	mux.HandleFunc("/v1/retrieve/id", s.withAuth(s.handleRetrieveByID))
	mux.HandleFunc("/v1/reinforce", s.withAuth(s.handleReinforce))
	mux.HandleFunc("/v1/penalize", s.withAuth(s.handlePenalize))
	s.http = &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	return s
}

// Start listens until the server is closed.
func (s *Server) Start() error {
	log.Printf("membraned: json http listening on %s", s.http.Addr)
	err := s.http.ListenAndServe()
	if err == http.ErrServerClosed {
		return nil
	}
	return err
}

// Stop drains in-flight HTTP requests.
func (s *Server) Stop(ctx context.Context) error {
	return s.http.Shutdown(ctx)
}

func (s *Server) withAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.apiKey != "" {
			got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			if got != s.apiKey {
				writeErr(w, http.StatusUnauthorized, "unauthorized")
				return
			}
		}
		next(w, r)
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"service": "membrain",
		"source":  "membrain",
	})
}

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	snap, err := s.membrane.GetMetrics(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, snap)
}

type ingestEventBody struct {
	Source      string   `json:"source"`
	EventKind   string   `json:"event_kind"`
	Ref         string   `json:"ref"`
	Summary     string   `json:"summary"`
	Tags        []string `json:"tags"`
	Scope       string   `json:"scope"`
	Sensitivity string   `json:"sensitivity"`
}

func (s *Server) handleIngestEvent(w http.ResponseWriter, r *http.Request) {
	var body ingestEventBody
	if err := decodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	rec, err := s.membrane.IngestEvent(r.Context(), ingestion.IngestEventRequest{
		Source:      body.Source,
		EventKind:   body.EventKind,
		Ref:         body.Ref,
		Summary:     body.Summary,
		Tags:        body.Tags,
		Scope:       body.Scope,
		Sensitivity: schema.Sensitivity(body.Sensitivity),
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rec)
}

type ingestObservationBody struct {
	Source      string   `json:"source"`
	Subject     string   `json:"subject"`
	Predicate   string   `json:"predicate"`
	Object      any      `json:"object"`
	Tags        []string `json:"tags"`
	Scope       string   `json:"scope"`
	Sensitivity string   `json:"sensitivity"`
}

func (s *Server) handleIngestObservation(w http.ResponseWriter, r *http.Request) {
	var body ingestObservationBody
	if err := decodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	rec, err := s.membrane.IngestObservation(r.Context(), ingestion.IngestObservationRequest{
		Source:      body.Source,
		Subject:     body.Subject,
		Predicate:   body.Predicate,
		Object:      body.Object,
		Tags:        body.Tags,
		Scope:       body.Scope,
		Sensitivity: schema.Sensitivity(body.Sensitivity),
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rec)
}

type ingestToolBody struct {
	Source      string         `json:"source"`
	ToolName    string         `json:"tool_name"`
	Args        map[string]any `json:"args"`
	Result      any            `json:"result"`
	Tags        []string       `json:"tags"`
	Scope       string         `json:"scope"`
	Sensitivity string         `json:"sensitivity"`
}

func (s *Server) handleIngestTool(w http.ResponseWriter, r *http.Request) {
	var body ingestToolBody
	if err := decodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	rec, err := s.membrane.IngestToolOutput(r.Context(), ingestion.IngestToolOutputRequest{
		Source:      body.Source,
		ToolName:    body.ToolName,
		Args:        body.Args,
		Result:      body.Result,
		Tags:        body.Tags,
		Scope:       body.Scope,
		Sensitivity: schema.Sensitivity(body.Sensitivity),
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rec)
}

type ingestWorkingBody struct {
	Source         string   `json:"source"`
	ThreadID       string   `json:"thread_id"`
	State          string   `json:"state"`
	NextActions    []string `json:"next_actions"`
	OpenQuestions  []string `json:"open_questions"`
	ContextSummary string   `json:"context_summary"`
	Tags           []string `json:"tags"`
	Scope          string   `json:"scope"`
	Sensitivity    string   `json:"sensitivity"`
}

func (s *Server) handleIngestWorking(w http.ResponseWriter, r *http.Request) {
	var body ingestWorkingBody
	if err := decodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	state := schema.TaskState(body.State)
	if state == "" {
		state = schema.TaskStateExecuting
	}
	rec, err := s.membrane.IngestWorkingState(r.Context(), ingestion.IngestWorkingStateRequest{
		Source:         body.Source,
		ThreadID:       body.ThreadID,
		State:          state,
		NextActions:    body.NextActions,
		OpenQuestions:  body.OpenQuestions,
		ContextSummary: body.ContextSummary,
		Tags:           body.Tags,
		Scope:          body.Scope,
		Sensitivity:    schema.Sensitivity(body.Sensitivity),
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rec)
}

type retrieveBody struct {
	TaskDescriptor string   `json:"task_descriptor"`
	MemoryTypes    []string `json:"memory_types"`
	MinSalience    float64  `json:"min_salience"`
	Limit          int      `json:"limit"`
	ActorID        string   `json:"actor_id"`
	MaxSensitivity string   `json:"max_sensitivity"`
}

func (s *Server) handleRetrieve(w http.ResponseWriter, r *http.Request) {
	var body retrieveBody
	if err := decodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	types := make([]schema.MemoryType, 0, len(body.MemoryTypes))
	for _, t := range body.MemoryTypes {
		types = append(types, schema.MemoryType(t))
	}
	maxSens := body.MaxSensitivity
	if maxSens == "" {
		maxSens = string(schema.SensitivityMedium)
	}
	resp, err := s.membrane.Retrieve(r.Context(), &retrieval.RetrieveRequest{
		TaskDescriptor: body.TaskDescriptor,
		MemoryTypes:    types,
		MinSalience:    body.MinSalience,
		Limit:          body.Limit,
		Trust: &retrieval.TrustContext{
			MaxSensitivity: schema.Sensitivity(maxSens),
			Authenticated:  true,
			ActorID:        body.ActorID,
		},
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"records":   resp.Records,
		"selection": resp.Selection,
	})
}

type retrieveByIDBody struct {
	ID             string `json:"id"`
	ActorID        string `json:"actor_id"`
	MaxSensitivity string `json:"max_sensitivity"`
}

func (s *Server) handleRetrieveByID(w http.ResponseWriter, r *http.Request) {
	var body retrieveByIDBody
	if err := decodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	maxSens := body.MaxSensitivity
	if maxSens == "" {
		maxSens = string(schema.SensitivityMedium)
	}
	rec, err := s.membrane.RetrieveByID(r.Context(), body.ID, &retrieval.TrustContext{
		MaxSensitivity: schema.Sensitivity(maxSens),
		Authenticated:  true,
		ActorID:        body.ActorID,
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rec)
}

type reviseBody struct {
	ID        string  `json:"id"`
	Actor     string  `json:"actor"`
	Rationale string  `json:"rationale"`
	Amount    float64 `json:"amount"`
}

func (s *Server) handleReinforce(w http.ResponseWriter, r *http.Request) {
	var body reviseBody
	if err := decodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.membrane.Reinforce(r.Context(), body.ID, body.Actor, body.Rationale); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "id": body.ID})
}

func (s *Server) handlePenalize(w http.ResponseWriter, r *http.Request) {
	var body reviseBody
	if err := decodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	amount := body.Amount
	if amount <= 0 {
		amount = 0.1
	}
	if err := s.membrane.Penalize(r.Context(), body.ID, amount, body.Actor, body.Rationale); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "id": body.ID})
}

func decodeJSON(r *http.Request, dest any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	return dec.Decode(dest)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"ok": false, "error": msg})
}
