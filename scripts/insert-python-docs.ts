/**
 * Insert Python documentation into knowledge base
 */

import { KnowledgeBase } from '../src/core/knowledge/knowledge-base.js';

const pythonDocs = [
  {
    content: "Python 装饰器（Decorator）是一个强大的功能，它允许你在不修改原有函数代码的情况下，给函数添加额外的功能。装饰器本质上是一个接受函数作为参数并返回一个新函数的函数。装饰器的基本语法：@decorator_name def function_name(): pass。这等价于：function_name = decorator_name(function_name)。常见用途：1. 日志记录：记录函数调用信息 2. 性能测试：计算函数执行时间 3. 权限验证：检查用户是否有权限执行函数 4. 缓存结果：缓存函数返回值避免重复计算 5. 事务处理：自动提交或回滚事务。示例 - 计时装饰器：import time def timer(func): def wrapper(*args, **kwargs): start = time.time() result = func(*args, **kwargs) end = time.time() print(f'{func.__name__} 执行时间: {end - start:.2f}秒') return result return wrapper @timer def slow_function(): time.sleep(1) return '完成'。带参数的装饰器：可以通过装饰器工厂函数来实现带参数的装饰器。",
    metadata: { topic: "decorator", category: "advanced" }
  },
  {
    content: "Python 生成器（Generator）是一种特殊的迭代器，使用 yield 关键字来生成值。生成器在需要时才生成值，而不是一次性生成所有值，因此非常节省内存。生成器的两种创建方式：1. 生成器函数：使用 yield 关键字 def count_down(n): while n > 0: yield n; n -= 1。2. 生成器表达式：类似列表推导式的语法 squares = (x*x for x in range(10))。生成器的优势：1. 内存效率：不需要一次性存储所有值 2. 惰性计算：只在需要时才计算下一个值 3. 无限序列：可以表示无限的数据流 4. 管道处理：可以链接多个生成器进行数据处理。常用方法：next()：获取下一个值；send()：向生成器发送值；close()：关闭生成器；throw()：在生成器中抛出异常。应用场景：处理大文件（逐行读取而不加载整个文件）、无限序列（斐波那契数列、素数生成等）、数据管道（ETL 操作中的数据转换）。",
    metadata: { topic: "generator", category: "intermediate" }
  },
  {
    content: "Python 上下文管理器（Context Manager）用于管理资源，确保资源在使用后正确释放。最常见的例子是 with 语句。基本用法：with open('file.txt', 'r') as f: content = f.read()；文件会自动关闭，即使发生异常。自定义上下文管理器有两种方法：方法1使用类 class MyContext: def __enter__(self): print('进入上下文'); return self；def __exit__(self, exc_type, exc_val, exc_tb): print('退出上下文'); return False。方法2使用 contextlib 装饰器 from contextlib import contextmanager；@contextmanager；def my_context(): print('进入上下文'); yield; print('退出上下文')。常见应用：1. 文件操作：自动关闭文件 2. 数据库连接：自动提交或回滚 3. 线程锁：自动获取和释放锁 4. 临时目录：自动清理临时文件 5. 计时器：自动计算代码块执行时间。上下文管理器的优势：代码更简洁清晰、自动资源管理避免忘记释放、异常安全即使出错也能正确清理。",
    metadata: { topic: "context-manager", category: "intermediate" }
  },
  {
    content: "Python 列表推导式（List Comprehension）是一种简洁创建列表的方式。它将循环和条件判断结合在一行代码中，使代码更加紧凑和可读。基本语法：[expression for item in iterable if condition]。示例：1. 基本用法 squares = [x**2 for x in range(10)] 得到 [0, 1, 4, 9, 16, 25, 36, 49, 64, 81]。2. 带条件过滤 evens = [x for x in range(20) if x % 2 == 0] 得到 [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]。3. 嵌套列表推导式 matrix = [[i*j for j in range(3)] for i in range(3)] 得到 [[0, 0, 0], [0, 1, 2], [0, 2, 4]]。4. 应用函数 words = ['hello', 'world', 'python']; upper_words = [word.upper() for word in words] 得到 ['HELLO', 'WORLD', 'PYTHON']。其他推导式：字典推导式 {k: v for k, v in iterable}、集合推导式 {x for x in iterable}、生成器表达式 (x for x in iterable)。性能考虑：列表推导式通常比等效的 for 循环更快，因为它们在 Python 内部进行了优化。",
    metadata: { topic: "list-comprehension", category: "basic" }
  },
  {
    content: "Python Lambda 函数是一种匿名函数，可以在需要函数对象的任何地方使用。Lambda 函数只能包含一个表达式，不能包含语句或多个表达式。基本语法：lambda arguments: expression。示例：1. 基本用法 add = lambda x, y: x + y; print(add(3, 5)) 输出 8。2. 与内置函数结合 numbers = [1, 2, 3, 4, 5]; squared = list(map(lambda x: x**2, numbers)) 得到 [1, 4, 9, 16, 25]。3. 排序关键字 students = [('Alice', 25), ('Bob', 20), ('Charlie', 23)]; students.sort(key=lambda x: x[1]) 按年龄排序。4. 与 reduce 结合 from functools import reduce; numbers = [1, 2, 3, 4, 5]; product = reduce(lambda x, y: x * y, numbers) 得到 120。Lambda 的限制：只能包含一个表达式、不能包含语句（如赋值、return）、不能包含多个表达式、不适合复杂逻辑。适用场景：简单的一次性函数、作为参数传递给高阶函数、需要函数对象的简短操作。",
    metadata: { topic: "lambda", category: "intermediate" }
  },
  {
    content: "Python 类和面向对象编程（OOP）的核心概念。类（Class）的定义：class MyClass: class_attr = 'I am class attribute'; def __init__(self, instance_attr): self.instance_attr = instance_attr; def instance_method(self): return 'Instance method'; @classmethod; def class_method(cls): return 'Class method'; @staticmethod; def static_method(): return 'Static method'。三大特性：1. 封装（Encapsulation）将数据和操作数据的方法绑定在一起，使用私有属性（__attr）限制外部访问，通过 property 装饰器控制访问。2. 继承（Inheritance）代码复用、方法重写（override）、多继承支持。3. 多态（Polymorphism）同一方法在不同对象中有不同行为、鸭子类型（Duck Typing）、方法重载（通过默认参数实现）。特殊方法（魔术方法）：__init__ 构造方法、__str__ 字符串表示、__repr__ 开发者表示、__len__ 长度、__getitem__ 索引访问、__call__ 可调用对象。",
    metadata: { topic: "oop", category: "basic" }
  },
  {
    content: "Python 异常处理机制让程序能够优雅地处理错误，而不是直接崩溃。基本语法：try: result = 10 / 0; except ZeroDivisionError as e: print(f'错误: {e}'); except Exception as e: print(f'未知错误: {e}'); else: print('操作成功'); finally: print('清理资源')。常见异常类型：ZeroDivisionError 除零错误、ValueError 值错误、TypeError 类型错误、IndexError 索引越界、KeyError 键不存在、AttributeError 属性不存在、FileNotFoundError 文件不存在、ImportError 模块导入失败。抛出异常：raise ValueError('Invalid value')。自定义异常：class MyError(Exception): def __init__(self, message): self.message = message; super().__init__(self.message)。异常处理的最佳实践：1. 具体化：捕获具体的异常类型 2. 最小化：只在可能出错的地方使用 3. 记录：记录异常信息用于调试 4. 清理：使用 finally 确保资源释放。",
    metadata: { topic: "exception-handling", category: "basic" }
  },
  {
    content: "Python 文件操作是日常编程中最常见的任务之一。打开文件：file = open('filename.txt', 'mode')。常用模式：'r' 只读（默认）、'w' 写入（覆盖文件）、'a' 追加、'r+' 读写、'b' 二进制模式（如 'rb', 'wb'）。推荐使用 with 语句：with open('file.txt', 'r', encoding='utf-8') as f: content = f.read()；文件自动关闭。读取方法：1. read() 读取全部内容 2. readline() 读取一行 3. readlines() 读取所有行到列表 4. 遍历文件 for line in f: print(line.strip())。写入方法：1. write() 写入字符串 2. writelines() 写入字符串列表。示例：写入文件 with open('output.txt', 'w', encoding='utf-8') as f: f.write('Hello, World!\\n'); f.writelines(['Line 1\\n', 'Line 2\\n'])。读取文件 with open('input.txt', 'r', encoding='utf-8') as f: lines = f.readlines()。文件操作最佳实践：1. 始终使用 with 语句 2. 明确指定编码（推荐 utf-8）3. 处理异常（FileNotFoundError, PermissionError）4. 使用路径库（pathlib）处理路径 5. 大文件使用逐行读取。",
    metadata: { topic: "file-operations", category: "basic" }
  }
];

async function insertPythonDocs() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  const knowledgeBase = new KnowledgeBase({
    db: {
      host: 'localhost',
      port: 5432,
      database: 'myagent',
      user: 'leo',
      password: '',
    },
    apiKey: apiKey,
    embeddingModel: 'text-embedding-3-small',
    embeddingDimensions: 1536,
  });

  try {
    for (const doc of pythonDocs) {
      const id = await knowledgeBase.addKnowledge(
        'default',
        'python-docs',
        doc.content,
        doc.metadata
      );
      console.log(`✅ Inserted: ${doc.metadata.topic} (ID: ${id})`);
    }

    console.log('\n✨ All Python docs inserted successfully!');
  } catch (error) {
    console.error('❌ Error inserting docs:', error);
  } finally {
    await knowledgeBase.close();
  }
}

insertPythonDocs();
