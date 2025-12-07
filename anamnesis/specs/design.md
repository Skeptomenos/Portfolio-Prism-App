# Design Spec (The "How It Works")

> **Usage:** Create visual diagrams for complex flows using Mermaid.js syntax.
> **When Required:** Multi-step interactions, entity lifecycles, system boundaries.
> **Pragmatism:** Skip this file if diagrams add no value for simple tasks.

---

## 1. System Context Diagram

High-level view of system boundaries and external actors.

```mermaid
flowchart TB
    User[User] --> App[Application]
    App --> DB[(Database)]
    App --> ExtAPI[External API]
```

---

## 2. Sequence Diagrams

For multi-step interactions (User -> API -> DB).

### [Flow Name]

```mermaid
sequenceDiagram
    participant U as User
    participant A as API
    participant D as Database
    
    U->>A: Request
    A->>D: Query
    D-->>A: Result
    A-->>U: Response
```

### [Add additional flows as needed]

---

## 3. State Diagrams

For entities with complex lifecycles.

### [Entity Name] Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Pending: Submit
    Pending --> Approved: Approve
    Pending --> Rejected: Reject
    Approved --> [*]
    Rejected --> Draft: Revise
```

### [Add additional state machines as needed]

---

## 4. Component Diagram

Optional: For modular architecture showing dependencies.

```mermaid
flowchart LR
    subgraph Core
        A[Module A]
        B[Module B]
    end
    subgraph IO
        C[Adapter C]
        D[Adapter D]
    end
    A --> B
    B --> C
    B --> D
```

---

## 5. Data Flow Diagram

Optional: For understanding data transformations.

```mermaid
flowchart LR
    Input[Raw Input] --> Transform[Transform]
    Transform --> Validate[Validate]
    Validate --> Output[Clean Output]
```

---

## Notes

- Keep diagrams focused and readable
- One concept per diagram
- Update diagrams when implementation diverges
- Reference diagrams in `requirements.md` where relevant
