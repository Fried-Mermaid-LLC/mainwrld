> Source: https://github.com/nestjs/docs.nestjs.com/blob/master/content/microservices/interceptors.md

# Interceptors

There is no difference between [regular interceptors](https://docs.nestjs.com/interceptors) and microservices interceptors. The following example uses a manually instantiated method-scoped interceptor. Just as with HTTP based applications, you can also use controller-scoped interceptors (i.e., prefix the controller class with a `@UseInterceptors()` decorator).

```typescript
@UseInterceptors(new TransformInterceptor())
@MessagePattern({ cmd: 'sum' })
accumulate(data: number[]): number {
  return (data || []).reduce((a, b) => a + b);
}
```
