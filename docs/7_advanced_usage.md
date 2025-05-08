# Advanced Usage

## Custom Processing Pipelines
```typescript
const customPipeline = new PreprocessingPrism()
  .addStep({
    name: "custom-filter",
    execute: (input) => input.replace(/sensitive/g, "***")
  });
```

## Performance Optimization
```bash
# Enable batch processing mode
MEMORABLE_BATCH_SIZE=1000 npm start
```

## Cross-Service Integration
```typescript
const nnnaClient = new NNNAServiceClient();
const prediction = await nnnaClient.predictNextAction(currentContext);
```

[Back to User Guide](docs/4_user_guide.md) | [Troubleshooting](docs/8_troubleshooting_guide.md)