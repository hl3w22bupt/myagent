"""
扩展的测试用例集 - 用于 Phase 2 Prompt 优化

涵盖多种数学主题、难度级别和教学场景。
"""

# 测试用例分类
TEST_CATEGORIES = {
    "calculus": {
        "name": "微积分",
        "test_cases": [
            {
                "id": "calc_001",
                "description": "生成一个泰勒公式的教学视频，重点讲解多项式逼近的核心理念",
                "expected_topic": "Taylor Series",
                "expected_difficulty": "intermediate",
                "key_elements": ["多项式逼近", "无限级数", "函数展开"]
            },
            {
                "id": "calc_002",
                "description": "导数的几何意义，通过切线斜率理解瞬时变化率",
                "expected_topic": "Derivative",
                "expected_difficulty": "introductory",
                "key_elements": ["切线", "斜率", "极限", "瞬时变化率"]
            },
            {
                "id": "calc_003",
                "description": "积分基本定理：连接微分和积分的桥梁",
                "expected_topic": "Fundamental Theorem of Calculus",
                "expected_difficulty": "intermediate",
                "key_elements": ["微积分基本定理", "原函数", "面积", "累积"]
            },
            {
                "id": "calc_004",
                "description": "微分方程入门：y' = ky 的求解与应用",
                "expected_topic": "Differential Equations",
                "expected_difficulty": "advanced",
                "key_elements": ["微分方程", "指数增长", "衰减", "分离变量"]
            },
            {
                "id": "calc_005",
                "description": "极限的概念：ε-δ 定义直观理解",
                "expected_topic": "Limits",
                "expected_difficulty": "advanced",
                "key_elements": ["极限", "ε-δ定义", "连续性", "无穷小"]
            }
        ]
    },

    "geometry": {
        "name": "几何",
        "test_cases": [
            {
                "id": "geom_001",
                "description": "勾股定理：直角三角形的三边关系 a² + b² = c²",
                "expected_topic": "Pythagorean Theorem",
                "expected_difficulty": "introductory",
                "key_elements": ["直角三角形", "平方", "勾股定理", "几何证明"]
            },
            {
                "id": "geom_002",
                "description": "圆的面积公式推导：从多边形逼近到积分",
                "expected_topic": "Circle Area",
                "expected_difficulty": "intermediate",
                "key_elements": ["圆面积", "π", "极限", "多边形逼近"]
            },
            {
                "id": "geom_003",
                "description": "三角函数的几何意义：单位圆上的定义",
                "expected_topic": "Trigonometric Functions",
                "expected_difficulty": "introductory",
                "key_elements": ["sin", "cos", "tan", "单位圆", "角度"]
            },
            {
                "id": "geom_004",
                "description": "立体几何：长方体和球体的体积计算",
                "expected_topic": "3D Geometry",
                "expected_difficulty": "intermediate",
                "key_elements": ["体积", "表面积", "立体图形", "空间想象"]
            },
            {
                "id": "geom_005",
                "description": "相似三角形：性质与应用",
                "expected_topic": "Similar Triangles",
                "expected_difficulty": "introductory",
                "key_elements": ["相似", "比例", "对应边", "角度相等"]
            }
        ]
    },

    "algebra": {
        "name": "代数",
        "test_cases": [
            {
                "id": "alg_001",
                "description": "二次方程的求根公式推导",
                "expected_topic": "Quadratic Formula",
                "expected_difficulty": "intermediate",
                "key_elements": ["二次方程", "配方法", "求根公式", "判别式"]
            },
            {
                "id": "alg_002",
                "description": "函数的概念：输入输出关系的可视化",
                "expected_topic": "Functions",
                "expected_difficulty": "introductory",
                "key_elements": ["函数", "自变量", "因变量", "函数图像"]
            },
            {
                "id": "alg_003",
                "description": "对数函数：从指数到对数的逆运算",
                "expected_topic": "Logarithms",
                "expected_difficulty": "intermediate",
                "key_elements": ["对数", "指数", "底数", "逆运算", "log规则"]
            },
            {
                "id": "alg_004",
                "description": "矩阵乘法：线性变换的组合",
                "expected_topic": "Matrix Multiplication",
                "expected_difficulty": "advanced",
                "key_elements": ["矩阵", "线性变换", "乘法规则", "应用"]
            },
            {
                "id": "alg_005",
                "description": "不等式的解法：一元二次不等式",
                "expected_topic": "Inequalities",
                "expected_difficulty": "intermediate",
                "key_elements": ["不等式", "区间", "符号表", "图像法"]
            }
        ]
    },

    "statistics": {
        "name": "统计与概率",
        "test_cases": [
            {
                "id": "stat_001",
                "description": "正态分布：钟形曲线的含义和应用",
                "expected_topic": "Normal Distribution",
                "expected_difficulty": "intermediate",
                "key_elements": ["正态分布", "均值", "标准差", "68-95-99.7规则"]
            },
            {
                "id": "stat_002",
                "description": "条件概率：贝叶斯定理的直观理解",
                "expected_topic": "Conditional Probability",
                "expected_difficulty": "advanced",
                "key_elements": ["条件概率", "贝叶斯定理", "先验概率", "后验概率"]
            },
            {
                "id": "stat_003",
                "description": "中心极限定理：为什么正态分布如此重要",
                "expected_topic": "Central Limit Theorem",
                "expected_difficulty": "advanced",
                "key_elements": ["中心极限定理", "样本均值", "抽样分布", "大数定律"]
            }
        ]
    },

    "linear_algebra": {
        "name": "线性代数",
        "test_cases": [
            {
                "id": "la_001",
                "description": "向量空间：基和维数的几何直观",
                "expected_topic": "Vector Spaces",
                "expected_difficulty": "advanced",
                "key_elements": ["向量空间", "基", "维数", "线性组合", "张成"]
            },
            {
                "id": "la_002",
                "description": "特征值和特征向量：矩阵的本质属性",
                "expected_topic": "Eigenvalues",
                "expected_difficulty": "advanced",
                "key_elements": ["特征值", "特征向量", "特征方程", "对角化"]
            }
        ]
    },

    "physics": {
        "name": "物理应用",
        "test_cases": [
            {
                "id": "phys_001",
                "description": "牛顿第二定律：F = ma 的数学表达",
                "expected_topic": "Newton's Second Law",
                "expected_difficulty": "introductory",
                "key_elements": ["力", "质量", "加速度", "矢量", "单位"]
            },
            {
                "id": "phys_002",
                "description": "简谐运动：弹簧振子的数学描述",
                "expected_topic": "Simple Harmonic Motion",
                "expected_difficulty": "intermediate",
                "key_elements": ["简谐运动", "微分方程", "周期", "频率", "振幅"]
            }
        ]
    }
}

# 所有测试用例的扁平化列表
ALL_TEST_CASES = []
for category, data in TEST_CATEGORIES.items():
    for test_case in data["test_cases"]:
        test_case["category"] = category
        test_case["category_name"] = data["name"]
        ALL_TEST_CASES.append(test_case)

# 难度级别定义
DIFFICULTY_LEVELS = {
    "introductory": {
        "name": "入门",
        "description": "适合初学者，概念直观",
        "recommended_scenes": 3,
        "recommended_duration": 10
    },
    "intermediate": {
        "name": "中级",
        "description": "需要一定基础，包含计算",
        "recommended_scenes": 4,
        "recommended_duration": 15
    },
    "advanced": {
        "name": "高级",
        "description": "概念抽象，需要深入理解",
        "recommended_scenes": 5,
        "recommended_duration": 20
    }
}

# 场景类型定义
SCENE_TYPES = {
    "title": {
        "name": "标题场景",
        "typical_duration": 15,
        "purpose": "展示主题和目标"
    },
    "introduction": {
        "name": "引入场景",
        "typical_duration": 25,
        "purpose": "介绍背景和动机"
    },
    "demonstration": {
        "name": "演示场景",
        "typical_duration": 35,
        "purpose": "核心内容展示"
    },
    "example": {
        "name": "例题场景",
        "typical_duration": 20,
        "purpose": "具体应用和练习"
    },
    "summary": {
        "name": "总结场景",
        "typical_duration": 10,
        "purpose": "回顾要点和加深印象"
    }
}


def get_test_cases_by_category(category: str):
    """获取指定类别的测试用例"""
    if category in TEST_CATEGORIES:
        return TEST_CATEGORIES[category]["test_cases"]
    return []


def get_test_cases_by_difficulty(difficulty: str):
    """获取指定难度的测试用例"""
    return [
        tc for tc in ALL_TEST_CASES
        if tc.get("expected_difficulty") == difficulty
    ]


def get_random_test_cases(count: int = 10):
    """获取随机测试用例"""
    import random
    return random.sample(ALL_TEST_CASES, min(count, len(ALL_TEST_CASES)))


def get_all_test_cases():
    """获取所有测试用例"""
    return ALL_TEST_CASES


if __name__ == "__main__":
    # 打印统计信息
    print(f"总测试用例数: {len(ALL_TEST_CASES)}")
    print("\n按类别统计:")
    for category, data in TEST_CATEGORIES.items():
        print(f"  {data['name']}: {len(data['test_cases'])} 个")

    print("\n按难度统计:")
    for difficulty in ["introductory", "intermediate", "advanced"]:
        count = len(get_test_cases_by_difficulty(difficulty))
        print(f"  {DIFFICULTY_LEVELS[difficulty]['name']}: {count} 个")
