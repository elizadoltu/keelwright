/*
  C4 model: <Product name>
  Generated as docs/architecture/c4/workspace.dsl (Structurizr DSL).

  Rules for this file:
  - Levels 1 (system context) and 2 (containers) only. Add a component view only for a
    container with real internal structure worth explaining.
  - Technology labels name the technology without versions; versions live in the ADRs
    and the architecture overview.
  - Every container and external system has a one-line description.
  - Every relationship is labelled with what it does and the protocol.
  - Managed services that store data (e.g. Supabase) are containers, not external systems.
*/

workspace "<Product name>" "<One sentence: what it does, for whom>" {

    !identifiers hierarchical

    model {
        user = person "<User type>" "<What they need>"

        product = softwareSystem "<Product name>" "<One line>" {
            web = container "Web app" "<Purpose>" "TanStack Start"
            api = container "API" "<Purpose>" "Node.js + Express"
            db  = container "Database" "<What it stores>" "PostgreSQL (Supabase)" {
                tags "Database"
            }
        }

        ext = softwareSystem "<External system>" "<Purpose>" {
            tags "External"
        }

        user -> product.web "Uses" "HTTPS"
        product.web -> product.api "Calls" "JSON/HTTPS"
        product.api -> product.db "Reads from and writes to" "SQL"
        product.api -> ext "<Does what>" "<Protocol>"
    }

    views {
        systemContext product "context" "System context" {
            include *
            autolayout lr
        }

        container product "containers" "Containers" {
            include *
            autolayout lr
        }

        styles {
            element "Person" {
                shape person
            }
            element "Database" {
                shape cylinder
            }
            element "External" {
                background #999999
                color #ffffff
            }
        }
    }
}
