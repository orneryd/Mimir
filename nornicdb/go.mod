module github.com/orneryd/nornicdb

go 1.24.0

require (
	github.com/spf13/cobra v1.8.0

	// Testing: MIT license
	github.com/stretchr/testify v1.8.4
)

require (
	github.com/davecgh/go-spew v1.1.2-0.20180830191138-d8f796af33cc // indirect
	github.com/inconshreveable/mousetrap v1.1.0 // indirect
	github.com/kr/pretty v0.1.0 // indirect
	github.com/kr/text v0.2.0 // indirect
	github.com/pmezard/go-difflib v1.0.1-0.20181226105442-5d4384ee4fb2 // indirect
	github.com/spf13/pflag v1.0.5 // indirect
	golang.org/x/crypto v0.45.0 // indirect
	gopkg.in/check.v1 v1.0.0-20190902080502-41f04d3bba15 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

// LICENSE AUDIT (all MIT-compatible):
// - Apache 2.0: Badger, Bleve - permissive, compatible with MIT
// - BSD-3: uuid - permissive, compatible with MIT
// - MIT: chi, cors, zap, viper, cobra, testify, vek
//
// REMOVED (we implement ourselves):
// - neo4j-go-driver: We implement Bolt protocol directly
// - antlr4-go: We write our own Cypher parser
// - grpc: Defer until needed
// - prometheus: Defer until needed
